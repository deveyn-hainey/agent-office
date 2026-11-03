// Command parser: free text -> intent. Pure (no DOM, no network, no ctx). Everything stays local.
//
// parseCommand(text, { team, selected, visible }) ->
//   { intent, agents:[ids], everyone:bool, place:{key,spec,label}|null, text?, pr?, floor?, choice?, raw, known }
// intents: go | huddle | nap | coffee | draw | present | review | fix | ci | approve | skip | cheer | status | help | unknown

const ALIASES = {
  lead: ['lead', 'claude code', 'claude', 'boss', 'pm'],
  codex: ['codex'],
  musecode: ['muse code', 'musecode', 'muse-code'],
  muse: ['muse'],
  grok: ['grok'],
  cursor: ['cursor'],
  argon: ['argon', 'the reviewer', 'reviewer'],
  chatgpt: ['chatgpt', 'chat gpt', 'gpt'],
  reva: ['review agent a', 'reviewer a', 'rev a', 'agent a'],
  revb: ['review agent b', 'reviewer b', 'rev b', 'agent b'],
  ops: ['ci runner', 'runner', 'ops'],
  scout: ['scout'],
};
const SELECTED_WORDS = /\b(that one|this one|that agent|this agent|the selected one|selected agent|them|him|her|they|it)\b/i;
const EVERYONE = /\b(everyone|everybody|all of (?:us|you|them)|all hands|the (?:whole )?team|all agents|all)\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// longest alias first so "muse code" wins over "muse"
const ALIAS_LIST = Object.entries(ALIASES)
  .flatMap(([id, list]) => list.map((a) => ({ id, a })))
  .sort((x, y) => y.a.length - x.a.length);

export function findAgents(text) {
  let s = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const { id, a } of ALIAS_LIST) {
    const re = new RegExp(`(^|[^a-z0-9])(${esc(a)})(?![a-z0-9])`, 'g');
    let m;
    while ((m = re.exec(s))) {
      const start = m.index + m[1].length;
      hits.push({ id, pos: start, len: a.length });
      s = s.slice(0, start) + ' '.repeat(a.length) + s.slice(start + a.length); // blank so shorter aliases can't re-match
      re.lastIndex = start + a.length;
    }
  }
  hits.sort((x, y) => x.pos - y.pos);
  const out = [];
  for (const h of hits) if (!out.includes(h.id)) out.push(h.id);
  return out;
}

// Place table, ordered most-specific first. spec is something agents.moveTo / resolveSlot understands, or 'home'.
const PLACES = [
  { key: 'conf-b', re: /\b(?:conf(?:erence)?\.?|meeting)?\s*room\s*b\b|\bconf(?:erence)?\s*b\b/i, spec: 'free:conf-3f-b', label: 'Conference Room B' },
  { key: 'conf-a', re: /\b(?:conf(?:erence)?\.?|meeting)?\s*room\s*a\b|\bconf(?:erence)?\s*a\b/i, spec: 'free:conf-3f-a', label: 'Conference Room A' },
  { key: 'conf-a', re: /\bconf(?:erence)?(?:\s*room)?\b|\bmeeting room\b/i, spec: 'free:conf-3f-a', label: 'Conference Room A' },
  { key: 'huddle', re: /\bhuddle(?: circle| area| spot)?\b|\brug\b/i, spec: 'free:huddle-4f', label: 'the huddle circle' },
  { key: 'ci', re: /\bci\s*(?:wall|screen|board)?\b|\bpipeline wall\b/i, spec: 'free:ci-2f-watch', label: 'the CI wall', needsWall: true },
  { key: 'team-board', re: /\b(?:team|2f|build)\s*(?:white\s*board|board)\b|\b2f\s*white\s*board\b/i, spec: 'slot:whiteboard-2f-front', label: 'the 2F team whiteboard' },
  { key: 'jira', re: /\bjira\b|\bkanban\b|\btask board\b/i, spec: 'slot:jira-2f', label: 'the Jira board' },
  { key: 'xray', re: /\bx-?\s?ray\b|\brepo map\b/i, spec: 'slot:xray-2f', label: 'the Repo X-Ray' },
  { key: 'vote', re: /\b(?:vote|decisions?)\s*(?:board|wall)?\b/i, spec: 'slot:vote-4f-front', label: 'the #decisions board', needsWall: true },
  { key: 'whiteboard', re: /\bwhite\s*board\b|\bstrategy board\b/i, spec: 'slot:whiteboard-4f-front', label: 'the 4F whiteboard' },
  { key: 'cork', re: /\bcork\s*board\b|\bevidence\b/i, spec: 'slot:corkboard-3f', label: 'the evidence corkboard' },
  { key: 'mural', re: /\b(?:lobby|logo|mural|1f)\s*wall\b|\bmural\b|\bwall\b/i, spec: 'free:mural-1f', label: 'the lobby mural wall' },
  { key: 'coffee', re: /\bcoffee|espresso|latte|cappuccino|cafe\b/i, spec: 'free:coffee-1f', label: 'the coffee bar' },
  { key: 'cooler', re: /\bwater\s*cooler\b|\bcooler\b/i, spec: 'free:cooler-1f', label: 'the water cooler' },
  { key: 'sofa', re: /\bsofa\b|\bcouch\b|\blounge\b|\bnap\s*room\b/i, spec: 'free:sofa-1f', label: 'the lobby sofa' },
  { key: 'hot', re: /\bhot\s*desk\b/i, spec: 'free:hot-1f', label: 'a hot desk' },
  { key: 'reception', re: /\breception\b/i, spec: 'slot:desk-1f-reception', label: 'reception' },
  { key: 'desk', re: /\b(?:(?:my|his|her|their|its|own|the|a)\s+)?(?:desk|seat|home)\b|\bback to (?:work|it)\b/i, spec: 'home', label: 'their desk' },
  { key: 'lobby', re: /\blobby\b|\bentrance\b|\bfront door\b|\bground floor\b/i, spec: 'free:wander-1f', label: 'the lobby' },
];

function findFloor(text) {
  const m = text.match(/\bfloor\s*#?\s*([1-4])\b|\b([1-4])\s*f\b|\b([1-4])(?:st|nd|rd|th)\s*floor\b/i);
  const n = m && +(m[1] || m[2] || m[3]);
  if (n) return { n, spec: `free:wander-${n}f`, label: `${n}F` };
  const words = { first: 1, second: 2, third: 3, fourth: 4, top: 4, bottom: 1 };
  const w = text.match(/\b(first|second|third|fourth|top|bottom)\s+floor\b/i);
  return w ? { n: words[w[1].toLowerCase()], spec: `free:wander-${words[w[1].toLowerCase()]}f`, label: `${words[w[1].toLowerCase()]}F` } : null;
}

export function findPlace(text, { allowDesk = true } = {}) {
  const fl = findFloor(text);
  const t = text;
  for (const p of PLACES) {
    if (p.key === 'desk' && !allowDesk) continue;
    if (p.re.test(t)) {
      // "ci" as a bare word should not hijack "run ci" -> only treat as place when a movement verb is around (caller decides)
      return { key: p.key, spec: p.spec, label: p.label };
    }
  }
  if (fl) return { key: 'floor', spec: fl.spec, label: fl.label, floor: fl.n };
  return null;
}

const GO_VERB = /\b(go|goes|send|move|walk|head|bring|take|meet|come|join|sit|stand|get over|report|run over|escort|bring)\b/i;

// text between the draw verb and a location preposition
function drawText(raw) {
  let m = raw.match(/\b(?:draw|paint|sketch|write|put|make|add|stencil)\b\s+(.+?)(?:\s+(?:on|onto|at|in|across)\s+(?:the\s+)?(?:[a-z0-9]+\s+){0,2}?(?:wall|mural|lobby|1f|board)\b.*)?$/i);
  let t = (m ? m[1] : raw).trim();
  const q = t.match(/["“'‘]([^"”’]+)["”’]/);
  if (q) t = q[1];
  t = t.replace(/^(?:a|an|the|me|us)\s+/i, '').replace(/\s+(?:please|pls|now)\.?$/i, '').replace(/[.!?]+$/, '').trim();
  return t || 'logo';
}

export function parseCommand(rawText, opts = {}) {
  const raw = String(rawText || '').trim();
  const out = { intent: 'unknown', agents: [], everyone: false, place: null, raw, known: false };
  if (!raw) return out;
  const low = raw.toLowerCase();

  // ---- agents ----
  let agents = findAgents(raw);
  if (EVERYONE.test(raw) && !/\ball (?:the )?(?:findings|tests|checks|jobs)\b/i.test(raw)) out.everyone = true;
  if (!agents.length && !out.everyone && SELECTED_WORDS.test(raw) && opts.selected) agents = [opts.selected];
  out.agents = agents;

  const pr = raw.match(/(?:\bpr\b|\bpull request\b|#)\s*#?(\d{2,4})\b/i) || raw.match(/\breview\s+#?(\d{2,4})\b/i);
  if (pr) out.pr = +pr[1];

  // ---- verbs (priority order) ----
  const place = findPlace(raw);
  out.place = place;

  const has = (re) => re.test(raw);
  const go = has(GO_VERB);

  if (/^\s*(?:help|\?|commands|what can (?:you|i) (?:do|say))\b/i.test(raw)) return done('help');
  if (has(/\b(?:approve|approved|ship it|lgtm|green[- ]?light|go ahead|yes please|merge it)\b/i)) { out.choice = 'Approve'; return done('approve'); }
  if (has(/^\s*(?:skip|reject|decline|not now|no)\b/i) || has(/\bskip (?:it|that|this)\b/i)) { out.choice = 'Skip'; return done('skip'); }
  if (has(/\breview(?:ing)?\b/i) && (out.pr || has(/\b(?:pr|pull request|code)\b/i)) && !has(/\bpresent\b/i)) return done('review');
  if (has(/\b(?:draw|paint|sketch|stencil|doodle)\b/i) || (has(/\bwrite\b.+\bon\b.+\bwall\b/i))) { out.text = drawText(raw); out.place = findPlace(raw) || { key: 'mural', spec: 'free:mural-1f', label: 'the lobby mural wall' }; return done('draw'); }
  if (has(/\b(?:run|start|kick\s?off|trigger|rerun|re-run|launch)\b.*\b(?:ci|tests?|pipeline|checks|build)\b/i) || has(/^\s*ci\b/i) || has(/\blocal ci\b/i)) return done('ci');
  if (has(/\bpresent(?:ation)?\b|\bshow (?:your |the |us )?(?:findings|results)\b|\breport (?:your )?findings\b|\bwalk us through\b/i)) return done('present');
  if (has(/\b(?:fix|patch|repair|resolve|debug)\b/i)) {
    const m = raw.match(/\b(?:fix|patch|repair|resolve|debug)\s+(.+)$/i);
    out.text = m ? m[1].replace(/^(?:the|this|that|a|an)\s+/i, '').replace(/[.!?]+$/, '') : '';
    if (/^(?:it|that|this|them)$/i.test(out.text)) out.text = '';
    return done('fix');
  }
  if (has(/\b(?:nap|sleep|snooze|siesta|lie down|power nap|take a rest|get some rest|rest)\b/i)) return done('nap');
  if (has(/\b(?:coffee|espresso|latte|cappuccino|caffeine)\b/i)) return done('coffee');
  if (has(/\b(?:huddle|regroup|assemble|all hands|gather|stand-?up)\b/i) || (place?.key === 'huddle' && (go || out.everyone))) return done('huddle');
  if (has(/\b(?:cheer|celebrate|party|high[- ]?five|applaud|wave)\b/i)) return done('cheer');
  if (place && (go || agents.length || has(/\bto\b/i))) return done('go');
  if (floorOnly()) return done('go');
  if (has(/\b(?:status|what(?:'s| is| are)\b.*\b(?:doing|up)|who(?:'s| is) (?:busy|free)|how(?:'s| is) it going|report)\b/i)) return done('status');
  return out;

  function floorOnly() { return !!findFloor(raw) && go; }
  function done(intent) {
    out.intent = intent; out.known = intent !== 'unknown';
    if (!out.place) out.place = place;
    return out;
  }
}

// helper for the executor: label of an intent for acks
export const INTENT_LABEL = {
  go: 'walk over', huddle: 'huddle', nap: 'nap', coffee: 'coffee run', draw: 'mural', present: 'present findings', review: 'code review',
  fix: 'fix', ci: 'local CI', approve: 'approve', skip: 'skip', cheer: 'cheer', status: 'status', help: 'help',
};

export const HELP_EXAMPLES = [
  'send Codex to conference room B', 'huddle everyone', 'Grok take a nap', 'Argon present findings', 'review PR 212',
  'tell Muse to draw the bet365 logo on the lobby wall', 'get Cursor a coffee', 'run CI', 'approve',
];
