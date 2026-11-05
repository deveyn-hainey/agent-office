// Builds the deployable Worker from a whitelist of runtime files (v2 only; no classic/, docs/, scripts/, v1 data).
// Usage (from repo root): node deploy/build.mjs  -> deploy/src/files.js (git-ignored) + deploy/dist/execute.js
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const INCLUDE = ['index.html', 'css', 'js', 'data/world.json', 'data/team.json', 'data/binders.json',
  'data/scenarios/index.json', 'data/scenarios/full-demo.json', 'data/scenarios/hero-review.json', 'data/scenarios/intake-huddle.json'];
const SKIP = /(^|\/)(README\.md|\.DS_Store)$/;
const BLOCK = /Montgomery|DMontgomery40|Russell|Kevin|agentteamfora|T0C92NRJM5G|C0C8|U0C9|xox|sk-ant/i;
// Live-only modules: served exclusively under /live/ (behind Cloudflare Access). Never part of the public FILES map.
const LIVE_ONLY = new Set(['js/director/adapters/live.js']);
// Extra blocklist from the private local config (real Slack IDs / display names), if present. Never committed.
const extra = [];
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/agent-office/config.json'), 'utf8'));
  extra.push(...Object.keys(cfg.channels || {}), ...Object.keys(cfg.users || {}));
  for (const u of Object.values(cfg.users || {})) if (u.display) extra.push(u.display.replace(/\s*\(.*\)$/, ''));
} catch { /* no local config: static blocklist only */ }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCK2 = extra.filter((s) => s && s.length >= 4).length ? new RegExp(extra.filter((s) => s && s.length >= 4).map(esc).join('|'), 'i') : null;
const files = {}, liveFiles = {};
const add = (rel) => { const p = path.join(repo, rel); if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).forEach((f) => add(rel + '/' + f)); if (SKIP.test(rel)) return;
  const txt = fs.readFileSync(p, 'utf8'); if (BLOCK.test(txt) || BLOCK2?.test(txt)) throw new Error('privacy check failed: ' + rel);
  (LIVE_ONLY.has(rel) ? liveFiles : files)['/' + rel] = txt; };
INCLUDE.forEach(add);
const d = path.join(repo, 'deploy');
// Non-secret Worker bindings for live mode (KV namespace id + Access app audience); override via deploy/live.bindings.json
const BINDINGS = JSON.parse(fs.readFileSync(path.join(d, 'live.bindings.json'), 'utf8'));
const filesJs = 'export const FILES = ' + JSON.stringify(files) + ';\nexport const LIVE_FILES = ' + JSON.stringify(liveFiles) + ';\n';
fs.writeFileSync(path.join(d, 'src/files.js'), filesJs);
const mods = Object.fromEntries(['worker.js', 'gate.js', 'live.js', 'files.js'].map((n) => [n, fs.readFileSync(path.join(d, 'src', n), 'utf8')]));
fs.mkdirSync(path.join(d, 'dist'), { recursive: true });
fs.writeFileSync(path.join(d, 'dist/execute.js'), `async () => {
  const mods = ${JSON.stringify(mods)};
  // KV + Access settings are non-secret ids (not credentials); INGEST_TOKEN / SITE_PASSWORD secrets are kept as-is.
  const metadata = { main_module: 'worker.js', compatibility_date: '2026-10-01', keep_bindings: ['secret_text'], bindings: ${JSON.stringify(BINDINGS)} };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  for (const [n, c] of Object.entries(mods)) form.append(n, new Blob([c], { type: 'application/javascript+module' }), n);
  const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/agent-office\`, body: form });
  return { success: r.success, modified: r.result?.modified_on };
}`);
console.log(Object.keys(files).length, 'public files +', Object.keys(liveFiles).length, 'live-only, privacy check passed');
