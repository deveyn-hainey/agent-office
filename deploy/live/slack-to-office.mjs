#!/usr/bin/env node
// slack-to-office: turn raw Slack channel reads (as returned by the Slack MCP read tools) into Agent Office
// director events, and optionally POST them to the private live endpoint.
//
//   node deploy/live/slack-to-office.mjs --config ~/.config/agent-office/config.json \
//        --raw ~/.config/agent-office/raw/<files or dir> [--out events.json] [--ingest] [--update-cursor]
//
// READ-ONLY by design: this script never talks to Slack. It only reads local files and (with --ingest) POSTs the
// sanitised events to INGEST_URL with the bearer INGEST_TOKEN from the env file named in the config.
// Real IDs/names live ONLY in the config file outside the repo (see config.example.json for the shape).
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const multi = (k) => { const out = []; args.forEach((a, i) => { if (a === k && args[i + 1]) out.push(args[i + 1]); }); return out; };
const home = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

const cfgPath = home(opt('--config', '~/.config/agent-office/config.json'));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const rawInputs = multi('--raw').map(home);
if (!rawInputs.length) rawInputs.push(home(cfg.rawDir || '~/.config/agent-office/raw'));
const cursorPath = home(cfg.cursorFile || '~/.config/agent-office/cursor.json');
const cursor = fs.existsSync(cursorPath) ? JSON.parse(fs.readFileSync(cursorPath, 'utf8')) : {};
const onlyNew = flag('--only-new');

/* ------------------------------------------------------------------ parse raw MCP output */
function* rawFiles() {
  for (const p of rawInputs) {
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) if (f.endsWith('.json')) yield path.join(p, f); }
    else yield p;
  }
}
function loadRaw(file) {
  const s = fs.readFileSync(file, 'utf8');
  let j;
  try { j = JSON.parse(s); } catch { const i = s.indexOf('{"messages"'); j = JSON.parse(s.slice(i, s.lastIndexOf('}') + 1)); }
  return typeof j.messages === 'string' ? j.messages : '';
}
const HEAD = /^(.*?) <([^>]*)> \((\w+)\) at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) \w+ === ?\nMessage TS: (\d+\.\d+)\n?([\s\S]*)$/;
function parse(text) {
  const chanM = text.match(/^Channel: #([\w-]+) \((\w+)\)/);
  const out = [];
  for (const blk of text.split('\n=== Message from ').slice(1)) {
    const m = blk.replace(/\n+$/, '').match(HEAD);
    if (!m) continue;
    const [, name, , uid, , ts, body] = m;
    // thread replies (when a thread read is saved) carry "Thread TS:" / "Parent" lines in some formats: keep the text only
    out.push({ channel: chanM?.[2], channelName: chanM?.[1], uid, name, ts, bot: /slack-bots\.com/.test(blk.split('\n')[0]), text: body.trim() });
  }
  return out;
}

/* ------------------------------------------------------------------ text cleanup */
function clean(t) {
  let sentUsing = null;
  t = t.replace(/\*?Sent using\*?\s*<@\w+\|([^>]+)>/gi, (_, n) => { sentUsing = n; return ''; });
  // mentions -> \u0001name\u0002 first, so a leading run of @-mentions ("@A @B @C Decision: …") can be dropped from snippets
  t = t.replace(/<@\w+\|([^>]+)>/g, '\u0001$1\u0002').replace(/<@(\w+)>/g, (_, id) => '\u0001' + (cfg.users?.[id]?.display || 'someone') + '\u0002');
  t = t.replace(/^(?:\s*(?:\[[^\]]{2,40}\]\s*)?)?(?:\s*\u0001[^\u0002]*\u0002[\s,:]*)+/, (m) => (m.match(/^\s*\[[^\]]{2,40}\]\s*/) || [''])[0]);
  t = t.replace(/\u0001([^\u0002]*)\u0002/g, '@$1');
  t = t.replace(/<#\w+\|([^>]*)>/g, '#$1');
  t = t.replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2').replace(/<https?:[^>]+>/g, 'link').replace(/https?:\/\/\S+/g, 'link');
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
  t = t.replace(/\b(xox[abpr]-[\w-]+|sk-[\w-]{12,}|cfast_\w+|gh[pousr]_\w{20,})\b/g, '[redacted]');
  t = t.replace(/```[\s\S]*?```/g, '[code]').replace(/[*_`~]/g, '').replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim();
  return { text: t, sentUsing };
}
const snip = (t, n = 140) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t);

/* ------------------------------------------------------------------ mapping */
const TAGS = Object.entries(cfg.tags || {}); // [ ["Lead · Codex","codex"], ["Muse","muse"], ...] longest first
TAGS.sort((a, b) => b[0].length - a[0].length);
const AGENT_NAMES = cfg.agentNames || {};
function actorOf(msg, cleaned) {
  const tag = cleaned.text.match(/^\[([^\]]{2,40})\]\s*/);
  let agent = null, display;
  if (tag) {
    const hit = TAGS.find(([k]) => k.toLowerCase() === tag[1].toLowerCase()) || TAGS.find(([k]) => tag[1].toLowerCase().includes(k.toLowerCase()));
    if (hit) agent = hit[1];
    cleaned.text = cleaned.text.slice(tag[0].length);
  }
  const u = cfg.users?.[msg.uid];
  if (!agent && u?.agent) agent = u.agent;
  if (agent) return { kind: 'agent', agent, who: AGENT_NAMES[agent] || agent };
  display = u?.display || (msg.bot ? 'Bot' : 'Teammate');
  return { kind: 'human', who: display, slot: u?.slot || 'op-4f-1', via: cleaned.sentUsing ? (cfg.sentUsing?.[cleaned.sentUsing] || null) : null };
}

/* ------------------------------------------------------------------ message -> events */
const PLACES = { review: 'slot:present-3f-a', ci: 'free:ci-2f-watch', decisions: 'slot:vote-4f-front', scratch: 'slot:whiteboard-4f-front', huddle: 'free:huddle-4f', jira: 'slot:jira-2f' };
function eventsFor(msg) {
  if (/has joined the channel|has left the channel/.test(msg.text)) return [];
  const c = clean(msg.text);
  if (!c.text) return [];
  const actor = actorOf(msg, c);
  const text = c.text;
  const low = text.toLowerCase();
  const chan = '#' + (cfg.channels?.[msg.channel]?.name || msg.channelName || 'build-room');
  const kindOfChan = cfg.channels?.[msg.channel]?.kind || 'build';
  const ms = Math.round(parseFloat(msg.ts) * 1000);
  let k = 0;
  const ev = (o) => ({ id: `${msg.ts}:${msg.channel}:${String(k++).padStart(2, '0')}`, ts: ms, channel: chan, ...o });
  const out = [];
  const a = actor.kind === 'agent' ? actor.agent : actor.via;

  // chat pane line (real snippet)
  if (actor.kind === 'human') out.push(ev({ type: 'operator', who: actor.who, text: snip(text, 140), slot: actor.slot, target: actor.via || null }));
  else out.push(ev({ type: 'feed', who: actor.who, agent: a, text: snip(text, 140) }));

  // ticket board
  const kans = [...new Set(text.match(/\bKAN-\d{1,5}\b/g) || [])].slice(0, 3);
  const col = /\b(merged|closed|shipped|done|landed|resolved)\b/.test(low) ? 'done' : /\b(review|pr\b|pull request|draft)/.test(low) ? 'review' : /\b(claim|claiming|taking|working on|start|started|implement)/.test(low) ? 'doing' : null;
  for (const key of kans) {
    const at = text.indexOf(key) + key.length;
    // title: the words right after the key (e.g. "KAN-12: fix the parser" -> "fix the parser"), else the words before it
    let around = text.slice(at, at + 80).replace(/^[\s:;,.)\]—–-]+/, '').replace(/\bKAN-\d+\b.*$/, '').trim();
    if (around.length < 6) around = text.slice(0, text.indexOf(key)).replace(/[\s:;,(\[—–-]+$/, '').split(/[.!?]\s/).pop().trim();
    out.push(ev({ type: 'jira', key, title: snip(around || key, 44), col: col || 'doing', ...(a ? { owner: a } : {}), quiet: false }));
  }
  // PRs -> review in the conference rooms
  const pr = text.match(/\b(?:PR\s*#?|pull request #?|#)(\d{2,4})\b/i);
  if (pr && /\b(review|reviewed|opened|is up|ready|draft|changes requested|approve)/.test(low)) {
    const room = Number(pr[1]) % 2 ? 'screen-3f-b' : 'screen-3f-a';
    out.push(ev({ type: 'screen', screen: room, title: `PR #${pr[1]} · review`, agent: a || 'argon' }));
    const sev = /\b(blocker|blocking|fail|broken|bug|regression)\b/.test(low) ? 'high' : /\b(nit|minor|flag|note|concern)\b/.test(low) ? 'low' : 'med';
    out.push(ev({ type: 'finding', screen: room, agent: a || 'argon', sev, text: snip(text, 90) }));
    if (a) out.push(ev({ type: 'move', agent: a, to: room === 'screen-3f-a' ? 'slot:present-3f-a' : 'slot:present-3f-b' }));
  }
  // CI wall
  const ciM = low.match(/\b(ci|tests?|typecheck|lint|build|e2e|checks?)\b[^.]{0,40}?\b(pass(?:ed|es|ing)?|green|fail(?:ed|s|ing)?|red|broke|running)\b/);
  if (ciM) {
    const status = /pass|green/.test(ciM[2]) ? 'pass' : /running/.test(ciM[2]) ? 'running' : 'fail';
    const job = { ci: 'ci', test: 'tests', tests: 'tests', typecheck: 'typecheck', lint: 'lint', build: 'build', e2e: 'e2e', check: 'checks', checks: 'checks' }[ciM[1]] || ciM[1];
    out.push(ev({ type: 'ci', job, status, note: snip(text, 50), ...(a ? { agent: a } : {}) }));
  }
  // decisions board
  if (kindOfChan === 'decisions' || /\b(decided|decision|we will|locked|agreed)\b/.test(low)) {
    out.push(ev({ type: 'surface', surface: 'vote-4f', op: 'push', data: { path: 'proposals', item: { id: `D-${msg.ts.slice(-4)}`, text: snip(text, 80), yes: kindOfChan === 'decisions' ? 2 : 0, no: 0, locked: kindOfChan === 'decisions', votes: {} } } }));
  }
  // scratchpad -> 4F whiteboard notes; claims -> sticky notes on the evidence corkboard
  if (kindOfChan === 'scratch') out.push(ev({ type: 'board', surface: 'board-4f', note: snip(`${actor.who.split(' ')[0]}: ${text}`, 70) }));
  if (/\b(claim|claiming|claimed)\b/.test(low)) out.push(ev({ type: 'surface', surface: 'cork-3f', op: 'push', data: { path: 'notes', item: { text: snip(`${actor.who.split(' ')[0]}: ${text}`, 60) } } }));
  // human approval needed
  if (a && /\b(approve|approval|sign[- ]?off|your call|need(?:s)? (?:you|your|a decision)|waiting on you|can you confirm|ok to (?:merge|ship|deploy))\b/.test(low)) {
    out.push(ev({ type: 'ask', id: `ask-${msg.ts}`, agent: a, text: snip(text, 110), options: ['Seen'], slack: false, cam: false }));
  }
  // huddles
  if (/\b(huddle|standup|stand-up|sync up|kickoff)\b/.test(low) && a) out.push(ev({ type: 'move', agent: a, to: PLACES.huddle }));

  // agent speaks + status (bubble only; the chat line above carries the real snippet)
  if (actor.kind === 'agent') {
    const place = out.some((e) => e.type === 'move') ? null : kindOfChan === 'decisions' ? PLACES.decisions : kindOfChan === 'scratch' ? PLACES.scratch : ciM ? PLACES.ci : kans.length ? PLACES.jira : null;
    if (place) out.push(ev({ type: 'move', agent: a, to: place }));
    out.push(ev({ type: 'status', agent: a, state: /\b(blocked|fail|error|broken)\b/.test(low) ? 'error' : 'working', task: snip(text, 60) }));
    out.push(ev({ type: 'say', agent: a, text: snip(text, 140), ms: 6000 }));
    if (/\b(merged|shipped|landed|all green|passed)\b/.test(low)) out.push(ev({ type: 'cheer', agents: [a], text: '🎉' }));
  } else if (actor.via) {
    out.push(ev({ type: 'say', agent: actor.via, text: snip(`(for ${actor.who.split(' ')[0]}) ${text}`, 140), ms: 6000 }));
  }
  return out;
}

/* ------------------------------------------------------------------ run */
const msgs = new Map();
for (const f of rawFiles()) for (const m of parse(loadRaw(f))) msgs.set(`${m.channel}:${m.ts}`, m);
let list = [...msgs.values()].filter((m) => !cfg.channels || cfg.channels[m.channel]);
if (onlyNew) list = list.filter((m) => !cursor[m.channel] || parseFloat(m.ts) > parseFloat(cursor[m.channel]));
list.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
const events = list.flatMap(eventsFor);
const counts = events.reduce((o, e) => ((o[e.type] = (o[e.type] || 0) + 1), o), {});
console.error(`messages: ${list.length} · events: ${events.length} · ${JSON.stringify(counts)}`);
const outPath = opt('--out');
if (outPath) { fs.writeFileSync(home(outPath), JSON.stringify({ events }, null, 1), { mode: 0o600 }); console.error(`wrote ${outPath}`); }

if (flag('--ingest')) {
  const envFile = home(cfg.ingestEnv || '~/.config/agent-office/ingest.env');
  const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  const url = env.INGEST_URL || cfg.ingestUrl;
  let sent = 0;
  for (let i = 0; i < events.length || i === 0; i += 400) {
    const chunk = events.slice(i, i + 400);
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${env.INGEST_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ events: chunk, replace: flag('--replace') && i === 0 }) });
    const body = await r.text();
    if (!r.ok) { console.error(`ingest failed: HTTP ${r.status} ${body.slice(0, 200)}`); process.exit(1); }
    sent += chunk.length;
    console.error(`ingest ok (${sent}/${events.length}): ${body.slice(0, 160)}`);
    if (!events.length) break;
  }
}
if (flag('--update-cursor')) {
  for (const m of list) if (!cursor[m.channel] || parseFloat(m.ts) > parseFloat(cursor[m.channel])) cursor[m.channel] = m.ts;
  cursor.updatedAt = new Date().toISOString();
  fs.writeFileSync(cursorPath, JSON.stringify(cursor, null, 1), { mode: 0o600 });
  console.error(`cursor -> ${cursorPath}`);
}
