// Sanity checks for data/world.json, team.json and scenarios. Run: node scripts/validate-world.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const w = j('data/world.json'), team = j('data/team.json');
let bad = 0;
const err = (m) => { bad++; console.log('ERR', m); };

const ids = new Set();
for (const s of w.slots) { if (ids.has(s.id)) err('dup slot ' + s.id); ids.add(s.id); }
const roomIds = new Set(w.rooms.map((r) => r.id));
for (const s of w.slots) if (s.room && !roomIds.has(s.room)) err(`slot ${s.id} room ${s.room} missing`);
for (const s of w.slots) if (Math.abs(s.x) > 22 || Math.abs(s.z) > 14) err(`slot ${s.id} outside floor`);
for (const t of team.agents) if (!ids.has(t.home)) err(`home slot ${t.home} missing for ${t.id}`);

const foot = (f) => { const sw = Math.abs(Math.round(f.rot / (Math.PI / 2))) % 2 === 1; const hw = (sw ? f.d : f.w) / 2, hd = (sw ? f.w : f.d) / 2; return f.shape === 'round' ? { hw: f.r, hd: f.r } : { hw, hd }; };
const inside = (x, z, f, m = 0.2) => { const { hw, hd } = foot(f); return Math.abs(x - f.x) < hw + m && Math.abs(z - f.z) < hd + m; };
for (const s of w.slots) {
  if (['sofa', 'wander'].includes(s.kind) && s.kind === 'sofa') continue;
  for (const f of w.furniture) if (f.solid && f.floor === s.floor && inside(s.x, s.z, f, 0.05)) err(`slot ${s.id} inside solid ${f.id}`);
  const core = (r) => Math.abs(s.x - r.x) < r.w / 2 && Math.abs(s.z - r.z) < r.d / 2;
  if (core(w.elevator) || core(w.stairs)) err(`slot ${s.id} inside core`);
}
const sids = new Set(w.surfaces.map((s) => s.id));
// scenarios
for (const f of readdirSync(join(root, 'data/scenarios')).filter((n) => n.endsWith('.json') && n !== 'index.json')) {
  const sc = j('data/scenarios/' + f);
  for (const e of sc.events) {
    const t = e.to && String(e.to).replace(/^slot:/, '');
    if (t && !t.startsWith('free:') && !ids.has(t)) err(`${f}: slot ${t} missing`);
    if (t?.startsWith('free:') && ![...ids].some((i) => i.startsWith(t.slice(5)))) err(`${f}: free prefix ${t} matches nothing`);
    if (e.surface && !sids.has(e.surface)) err(`${f}: surface ${e.surface} missing`);
  }
}
console.log(bad ? `${bad} problems` : 'world/team/scenarios OK');
process.exit(bad ? 1 : 0);
