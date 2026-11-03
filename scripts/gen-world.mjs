// Generates data/world.json (S0 owns). Run: node scripts/gen-world.mjs
// Conventions: floor index 0 = 1F. Coordinates are floor-local, origin = floor centre, +x right, +z toward viewer.
// facing/rot = yaw in radians, 0 faces +z, PI/2 faces +x, PI faces -z, -PI/2 faces -x  (dir = (sin, cos)).
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PI = Math.PI, H = PI / 2;
const r2 = (n) => Math.round(n * 100) / 100;
const W = 44, D = 28, HW = W / 2, HD = D / 2;
const WALL_H = 6.5;

const floors = [
  { id: '1f', index: 0, number: 1, name: 'Lobby / Lounge', accent: '#f3c6d3' },
  { id: '2f', index: 1, number: 2, name: 'Build / Ops', accent: '#bcd6f2' },
  { id: '3f', index: 2, number: 3, name: 'Review', accent: '#bfe3c6' },
  { id: '4f', index: 3, number: 4, name: 'Strategy', accent: '#cdbcf0' },
];
const N = (fi) => fi + 1;

const rooms = [], walls = [], furniture = [], slots = [], surfaces = [];

const room = (fi, id, label, x, z, w, d, extra = {}) =>
  rooms.push({ id: `${id}-${N(fi)}f`, floor: fi, label, x, z, w, d, dotted: true, ...extra });
const wall = (fi, id, kind, x1, z1, x2, z2, extra = {}) =>
  walls.push({ id: `${id}-${N(fi)}f`, floor: fi, kind, x1, z1, x2, z2, h: WALL_H, ...extra });
// furniture: type, x, z, rot, w, d, h ; solid:false items are walkable (rugs) or wall decals
let fcount = 0;
const furn = (fi, type, x, z, rot, w, d, h, extra = {}) =>
  furniture.push({ id: extra.id || `${type}-${N(fi)}f-${++fcount}`, type, floor: fi, x: r2(x), z: r2(z), rot: r2(rot), w, d, h, solid: true, ...extra });
const slot = (fi, id, kind, x, z, facing, roomId, extra = {}) =>
  slots.push({ id, floor: fi, kind, x: r2(x), z: r2(z), facing: r2(facing), room: roomId ? `${roomId}-${N(fi)}f` : null, ...extra });
const surf = (fi, id, kind, x, y, z, w, h, rot) =>
  surfaces.push({ id, floor: fi, kind, x: r2(x), y, z: r2(z), w, h, rot: r2(rot) });
const face = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

// desk helper: user sits at (cx,cz) facing `facing`; desk sits 1.45 ahead of the chair.
function deskSeat(fi, id, cx, cz, facing, roomId, extra = {}, kind = 'desk') {
  const dx = Math.sin(facing) * 1.45, dz = Math.cos(facing) * 1.45;
  furn(fi, 'desk', cx + dx, cz + dz, facing, 3.0, 1.4, 1.0, { id: `${id}-furn`, seat: extra.seat, ...(kind === 'operator' ? { human: extra.human } : {}) });
  const { human, ...slotExtra } = extra;
  slot(fi, id, kind, cx, cz, facing, roomId, slotExtra);
}
function sofa(fi, id, x, z, roomId) {
  furn(fi, 'sofa', x, z, 0, 3.2, 1.5, 0.9, { id: `${id}-furn` });
  slot(fi, id, 'sofa', x, z, 0, roomId, { lie: true });
}

// ---------- shared on every floor ----------
for (const f of floors) {
  const fi = f.index, n = N(fi);
  // outer back walls (the only two walls drawn on every floor in the cutaway)
  wall(fi, 'wall-back', 'outer', -HW, -HD, HW, -HD, { thick: 0.5 });
  wall(fi, 'wall-left', 'outer', -HW, -HD, -HW, HD, { thick: 0.5 });
  // elevator waiting + stairs landing spots (same x/z on every floor)
  slot(fi, `elevator-${n}f`, 'elevator', 18.5, -7.4, PI, 'core');
  slot(fi, `elevator-${n}f-2`, 'elevator', 16.9, -6.8, PI, 'core');
  slot(fi, `elevator-${n}f-3`, 'elevator', 20.2, -6.8, PI, 'core');
  slot(fi, `stairs-${n}f`, 'stairs', 12.5, -7.4, PI, 'core');
  // wander spots for ambient life
  const wander = { 0: [[-8, 0], [6, 2], [-2, 4], [10, 0]], 1: [[2, 5.5], [12, 4], [-18, 8], [8, -4]], 2: [[10, 2], [4, 6], [-4, 4], [-16, 1]], 3: [[-1, 6], [12, 1], [4, -3], [-6, 8]] }[fi];
  wander.forEach(([x, z], k) => slot(fi, `wander-${n}f-${k + 1}`, 'wander', x, z, 0, null));
  room(fi, 'core', 'Elevator + stairs', 15.5, -10.8, 11, 6, { annot: false });
  // windows on the left back wall (decals)
  furn(fi, 'window', -HW + 0.06, -8, H, 3.4, 0.1, 3.0, { solid: false, y: 3.6, id: `window-${n}f-a` });
  furn(fi, 'window', -HW + 0.06, 11.5, H, 3.4, 0.1, 3.0, { solid: false, y: 3.6, id: `window-${n}f-b` });
}

// ---------- 4F Strategy (index 3) ----------
{
  const fi = 3, n = 4;
  const cx = -10, cz = -3, R = 3.3;
  furn(fi, 'rug', cx, cz, 0, 9, 9, 0.04, { shape: 'round', r: 4.4, solid: false, color: '#d9cdf3', id: 'rug-4f-huddle' });
  for (let k = 0; k < 6; k++) {
    const a = (PI / 180) * (30 + 60 * k);
    const x = cx + R * Math.cos(a), z = cz + R * Math.sin(a);
    slot(fi, `huddle-4f-${k + 1}`, 'huddle', x, z, face(x, z, cx, cz), 'huddle', { seat: k + 1 });
  }
  surf(fi, 'board-4f', 'whiteboard', -11, 3.6, -13.93, 12, 4.6, 0);
  surf(fi, 'vote-4f', 'voteboard', 2.5, 3.5, -13.93, 7, 4.2, 0);
  slot(fi, 'whiteboard-4f-front', 'whiteboard-front', -11, -11.7, PI, 'whiteboard');
  slot(fi, 'vote-4f-front', 'whiteboard-front', 2.5, -11.7, PI, 'vote');
  furn(fi, 'clock', 8, -13.9, 0, 1.4, 0.1, 1.4, { solid: false, y: 5.3, id: 'clock-4f' });
  // lead desk: user faces +x toward the room
  deskSeat(fi, 'desk-4f-lead', -19.5, 2, H, 'lead');
  // connector desks
  deskSeat(fi, 'desk-4f-chatgpt', 9, 4, 0, 'connectors');
  deskSeat(fi, 'desk-4f-scout', 13, 4, 0, 'connectors');
  deskSeat(fi, 'desk-4f-3', 17, 4, 0, 'connectors');
  // lounge corner
  sofa(fi, 'sofa-4f-1', -18, 9.5, 'lounge');
  sofa(fi, 'sofa-4f-2', -13.4, 9.5, 'lounge');
  furn(fi, 'coffeetable', -15.7, 11.6, 0, 1.6, 1.0, 0.5, {});
  furn(fi, 'rug', -15.7, 10.6, 0, 11, 4.4, 0.04, { solid: false, color: '#e3d9f5', id: 'rug-4f-lounge' });
  furn(fi, 'plant', -20.6, 12.6, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'plant', -20.6, -12.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  room(fi, 'huddle', 'Huddle circle', cx, cz, 11, 10);
  room(fi, 'whiteboard', 'Whiteboard', -11, -10.5, 13, 4);
  room(fi, 'vote', '#decisions board', 2.5, -10.5, 8.5, 4);
  room(fi, 'lead', 'Lead desk', -18, 2, 5, 5.5);
  room(fi, 'connectors', 'Connector desks', 13, 4.8, 12, 4.2);
  room(fi, 'lounge', 'Lounge corner', -15.7, 10.3, 11, 5.4);
  // Operator Room: low glass partition (front, right, left, back with an open doorway) + three HUMAN desks (facing the viewer like the bots' desks).
  // Humans are not agents: slots are kind 'operator' (no agent reserves them); props.js draws a chair + operators.js the figure.
  {
    const x0 = 6.8, x1 = 21.4, zb = 7.9, zf = 13.4, h = 2.4;
    const gw = { thick: 0.12, h };
    wall(fi, 'glass-op-front', 'glass', x0, zf, x1, zf, gw);
    wall(fi, 'glass-op-right', 'glass', x1, zb, x1, zf, gw);
    wall(fi, 'glass-op-left', 'glass', x0, zb, x0, zf, gw);
    wall(fi, 'glass-op-back', 'glass', x0, zb, x1, zb, { ...gw, gaps: [{ from: 12.8, to: 15.2 }] });
    room(fi, 'operator', 'Operator Room', (x0 + x1) / 2, (zb + zf) / 2, x1 - x0, zf - zb, { glass: true });
    furn(fi, 'rug', (x0 + x1) / 2, (zb + zf) / 2, 0, x1 - x0 - 0.8, zf - zb - 0.8, 0.04, { solid: false, color: '#ece6f6', id: 'rug-4f-operator' });
    [['op-4f-1', 10.4, 'Operator'], ['op-4f-2', 14.1, 'PM'], ['op-4f-3', 17.8, 'Reviewer (human)']].forEach(([id, x, who]) =>
      deskSeat(fi, id, x, 9.4, 0, 'operator', { seat: who, human: who }, 'operator'));
    furn(fi, 'plant', 8.0, 8.9, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  }
}

// ---------- 3F Review (index 2) ----------
{
  const fi = 2, n = 3;
  // conference rooms flush to the back walls; glass only on the free sides
  const defs = [{ k: 'a', cx: -15.5, w: 13, doorC: -12 }, { k: 'b', cx: 0, w: 12, doorC: 4 }];
  for (const r of defs) {
    const x0 = r.cx - r.w / 2, x1 = r.cx + r.w / 2, zf = -2, zb = -HD;
    const gap = { from: r.doorC - 1.2, to: r.doorC + 1.2, door: `door-3f-${r.k}` };
    wall(fi, `glass-${r.k}-front`, 'glass', x0, zf, x1, zf, { gaps: [gap], thick: 0.12 });
    wall(fi, `glass-${r.k}-right`, 'glass', x1, zb, x1, zf, { thick: 0.12 });
    if (r.k === 'b') wall(fi, 'glass-b-left', 'glass', x0, zb, x0, zf, { thick: 0.12 });
    room(fi, `conf-${r.k}`, `Conference Room ${r.k.toUpperCase()}`, r.cx, (zb + zf) / 2, r.w, zf - zb, { glass: true });
    furn(fi, 'table', r.cx, -6.5, 0, 5.2, 2.2, 0.95, { id: `table-3f-${r.k}` });
    const seats = [[-1.6, -8.5, 0], [1.6, -8.5, 0], [-1.6, -4.5, PI], [1.6, -4.5, PI]];
    seats.forEach(([dx, z, fa], i) => {
      slot(fi, `conf-3f-${r.k}-${i + 1}`, 'conf-seat', r.cx + dx, z, fa, `conf-${r.k}`, { seat: i + 1 });
      furn(fi, 'chair', r.cx + dx, z, fa, 0.9, 0.9, 1.0, { solid: false, id: `chair-3f-${r.k}-${i + 1}` });
    });
    slot(fi, `present-3f-${r.k}`, 'present', r.cx, -11.6, 0, `conf-${r.k}`);
    slot(fi, `door-3f-${r.k}-in`, 'door', r.doorC, -3.2, 0, `conf-${r.k}`);
    slot(fi, `door-3f-${r.k}-out`, 'door', r.doorC, -0.6, 0, null);
    surf(fi, `screen-3f-${r.k}`, 'confscreen', r.cx, 3.6, -13.93, 8, 3.8, 0);
    furn(fi, 'rug', r.cx, -6.5, 0, 8, 6, 0.04, { solid: false, color: '#d4ecd9', id: `rug-3f-${r.k}` });
  }
  // reviewer home desk + evidence corkboard on the left wall
  deskSeat(fi, 'desk-3f-argon', -15, 4.5, 0, 'reviewer');
  deskSeat(fi, 'desk-3f-reva', -11.2, 4.5, 0, 'reviewer');
  deskSeat(fi, 'desk-3f-revb', -7.4, 4.5, 0, 'reviewer');
  deskSeat(fi, 'desk-3f-4', -3.6, 4.5, 0, 'reviewer');   // spare
  surf(fi, 'cork-3f', 'corkboard', -HW + 0.07, 3.4, 7.5, 7, 3.8, H);
  slot(fi, 'corkboard-3f', 'corkboard', -19.8, 7.5, -H, 'evidence');
  furn(fi, 'bookshelf', -HW + 0.4, 1, H, 2.6, 0.7, 2.6, {});
  // lounge (right front)
  sofa(fi, 'sofa-3f-1', 10, 8.5, 'lounge');
  sofa(fi, 'sofa-3f-2', 14.6, 8.5, 'lounge');
  furn(fi, 'coffeetable', 12.3, 10.6, 0, 1.6, 1.0, 0.5, {});
  furn(fi, 'rug', 12.3, 9.6, 0, 11, 4.4, 0.04, { solid: false, color: '#d4ecd9', id: 'rug-3f-lounge' });
  furn(fi, 'plant', 20.4, 12.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'plant', -9.4, 0.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'clock', 9, -13.9, 0, 1.4, 0.1, 1.4, { solid: false, y: 5.3, id: 'clock-3f' });
  room(fi, 'reviewer', 'Review pod', -9.3, 5.2, 15.4, 5);
  room(fi, 'evidence', 'Evidence board', -19.2, 7.5, 4.6, 8.5);
  room(fi, 'lounge', 'Lounge', 12.3, 9.8, 11, 5.4);
}

// ---------- 2F Build / Ops (index 1) ----------
{
  const fi = 1, n = 2;
  // pods: [id, label, px, pz]
  const pods = [['mac', 'Mac app', -12, 1.5], ['mobile', 'Mobile', -3, 1.5], ['ai', 'AI-wiring', 6, 1.5], ['design', 'Design', -8, 9.5], ['ui', 'UI', 1, 9.5]];
  for (const [id, label, px, pz] of pods) {
    room(fi, `pod-${id}`, label, px, pz, 8.5, 5.6, { seat: label, annot: false });
    furn(fi, 'rug', px, pz, 0, 8, 5, 0.04, { solid: false, color: '#d3e4f6', id: `rug-2f-${id}` });
    deskSeat(fi, `desk-2f-${id}-1`, px - 2, pz - 1, 0, `pod-${id}`, { seat: label });
    deskSeat(fi, `desk-2f-${id}-2`, px + 2, pz - 1, 0, `pod-${id}`, { seat: label });
  }
  // ops pod (CI runner's own desk + a spare) right of the AI-wiring pod
  furn(fi, 'rug', 16.5, 1.1, 0, 8, 5, 0.04, { solid: false, color: '#d3e4f6', id: 'rug-2f-ops' });
  deskSeat(fi, 'desk-2f-ops-1', 14.5, 0, 0, 'pod-ops', { seat: 'Ops' });
  deskSeat(fi, 'desk-2f-ops-2', 18.5, 0, 0, 'pod-ops', { seat: 'Ops' });
  room(fi, 'pod-ops', 'Ops', 16.5, 1.1, 8.5, 5.6, { seat: 'Ops', annot: false });
  // back wall: team whiteboard | jira | CI wall | rack
  surf(fi, 'board-2f', 'whiteboard', -16, 3.6, -13.93, 10, 4.4, 0);
  surf(fi, 'jira-2f', 'jira', -6.5, 3.6, -13.93, 10, 4.4, 0);
  surf(fi, 'ci-2f', 'ciwall', 3.9, 3.6, -13.93, 8.8, 4.4, 0);
  furn(fi, 'rack', 9.2, -13.0, 0, 1.4, 1.2, 3.2, { id: 'rack-2f' });
  surf(fi, 'xray-2f', 'xray', -HW + 0.07, 3.6, 4, 8, 4.4, H);
  slot(fi, 'xray-2f', 'xray', -19.8, 4, -H, 'xray');
  slot(fi, 'whiteboard-2f-front', 'whiteboard-front', -16, -11.7, PI, 'teamboard');
  slot(fi, 'present-2f-1', 'present', -18.5, -11.4, 0, 'teamboard');
  slot(fi, 'present-2f-2', 'present', -13.5, -11.4, 0, 'teamboard');
  [[-19, -7.5], [-16, -7.5], [-13, -7.5], [-18, -5.3], [-15, -5.3], [-12, -5.3]].forEach(([x, z], i) =>
    slot(fi, `audience-2f-${i + 1}`, 'audience', x, z, face(x, z, -16, -13), 'teamboard', { seat: i + 1 }));
  slot(fi, 'jira-2f', 'whiteboard-front', -6.5, -11.7, PI, 'jira');
  slot(fi, 'ci-2f', 'ci', 3.9, -11.6, PI, 'ci');
  [1, 3.9, 6.8].forEach((x, i) => slot(fi, `ci-2f-watch-${i + 1}`, 'ci', x, -8.6, PI, 'ci'));
  furn(fi, 'rug', -16, -6.8, 0, 9, 5.6, 0.04, { solid: false, color: '#d3e4f6', id: 'rug-2f-teamboard' });
  // lounge
  sofa(fi, 'sofa-2f-1', 14, 9.5, 'lounge');
  sofa(fi, 'sofa-2f-2', 18.6, 9.5, 'lounge');
  furn(fi, 'coffeetable', 16.3, 11.6, 0, 1.6, 1.0, 0.5, {});
  furn(fi, 'rug', 16.3, 10.6, 0, 9.5, 4.4, 0.04, { solid: false, color: '#d3e4f6', id: 'rug-2f-lounge' });
  furn(fi, 'plant', 20.4, 12.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'plant', -20.6, 12.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  room(fi, 'teamboard', 'Team whiteboard', -16, -8.5, 11, 8);
  room(fi, 'jira', 'Jira board', -6.5, -10, 10, 5);
  room(fi, 'ci', 'CI wall', 3.9, -9.7, 9.5, 6);
  room(fi, 'xray', 'Repo X-Ray', -19.9, 4, 3.8, 8.5);
  room(fi, 'rack', 'Server rack', 9.2, -12.4, 2.2, 2.4);
  room(fi, 'lounge', 'Lounge', 16.3, 10.3, 9.5, 5.4);
}

// ---------- 1F Lobby / Lounge (index 0) ----------
{
  const fi = 0, n = 1;
  surf(fi, 'mural-1f', 'mural', -14, 3.4, -13.93, 11, 4.6, 0);
  slot(fi, 'mural-1f', 'mural', -14, -11.6, PI, 'mural');
  slot(fi, 'mural-1f-2', 'mural', -17.5, -11.6, PI, 'mural');
  slot(fi, 'mural-1f-3', 'mural', -10.5, -11.6, PI, 'mural');
  surf(fi, 'slack-1f', 'slack', -2, 3.4, -13.93, 9, 4.6, 0);
  // coffee bar
  furn(fi, 'coffeebar', 7, -12.6, 0, 6, 2.0, 1.1, { id: 'coffeebar-1f' });
  furn(fi, 'coffeemachine', 8.2, -12.6, 0, 1, 0.9, 1.7, { solid: false, y: 1.1, id: 'coffeemachine-1f' });
  slot(fi, 'coffee-1f-1', 'coffee', 6, -10.8, PI, 'coffee');
  slot(fi, 'coffee-1f-2', 'coffee', 8.2, -10.8, PI, 'coffee');
  // water cooler (left wall)
  furn(fi, 'cooler', -HW + 0.8, -3, H, 0.9, 0.9, 1.6, { id: 'cooler-1f' });
  slot(fi, 'cooler-1f-1', 'cooler', -19.3, -3.7, -H, 'cooler');
  slot(fi, 'cooler-1f-2', 'cooler', -19.3, -2.2, -H, 'cooler');
  // entrance doors on left wall + reception
  furn(fi, 'entrance', -HW + 0.1, 8.5, H, 3.6, 0.2, 3.8, { solid: false, y: 0, id: 'entrance-1f' });
  slot(fi, 'entrance-1f', 'door', -19.8, 8.5, H, 'reception');
  furn(fi, 'reception', -16.6, 6.1, 0, 4.2, 1.4, 1.1, { id: 'reception-1f' });
  slot(fi, 'desk-1f-reception', 'desk', -16.6, 4.6, 0, 'reception');
  furn(fi, 'rug', -17.5, 8.8, 0, 7, 4, 0.04, { solid: false, color: '#f6d8e1', id: 'rug-1f-entry' });
  // nap sofas
  [-5, 0, 5].forEach((x, i) => sofa(fi, `sofa-1f-${i + 1}`, x, 9.2, 'naps'));
  furn(fi, 'rug', 0, 10, 0, 16, 4.6, 0.04, { solid: false, color: '#f6d8e1', id: 'rug-1f-naps' });
  furn(fi, 'coffeetable', -2.5, 11.8, 0, 1.4, 1.0, 0.5, {});
  furn(fi, 'coffeetable', 2.5, 11.8, 0, 1.4, 1.0, 0.5, {});
  // hot desks
  [[14, 3], [18, 3], [14, 8.5], [18, 8.5]].forEach(([x, z], i) => deskSeat(fi, `hot-1f-${i + 1}`, x, z, 0, 'hot', { hot: true }));
  furn(fi, 'foosball', -4, -3, 0, 3, 1.6, 1.0, { id: 'foosball-1f' });
  furn(fi, 'plant', -20.6, 12.6, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'plant', 20.4, 12.4, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'plant', 11, -5.2, 0, 1, 1, 1.8, { shape: 'round', r: 0.5 });
  furn(fi, 'clock', 4, -13.9, 0, 1.4, 0.1, 1.4, { solid: false, y: 5.3, id: 'clock-1f' });
  room(fi, 'mural', 'Logo mural wall', -14, -10.6, 11.5, 5);
  room(fi, 'slack', 'Slack screen', -2, -10.4, 9.5, 4.4);
  room(fi, 'coffee', 'Coffee bar', 7, -10.8, 7, 5);
  room(fi, 'cooler', 'Water cooler', -19.5, -2.9, 3.6, 4);
  room(fi, 'reception', 'Reception', -17.5, 6.2, 6.5, 7.5);
  room(fi, 'naps', 'Nap sofas', 0, 10, 16.5, 5);
  room(fi, 'hot', 'Hot desks', 16, 6, 9, 9);
}

// ---------- desk nameplates (data/team.json decides who owns which desk) ----------
// Every desk furniture item gets `plate:{name, sub?, open?|hot?|human?}`; props.js renders it as a small white plaque with a berry edge.
{
  const team = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'team.json'), 'utf8'));
  const owner = new Map(team.agents.map((a) => [a.home, a]));
  const slotKind = new Map(slots.map((s) => [s.id, s]));
  for (const f of furniture) {
    if (f.type !== 'desk') continue;
    const sid = f.id.replace(/-furn$/, '');
    const a = owner.get(sid), sl = slotKind.get(sid);
    if (f.human) { f.plate = { name: f.human, sub: 'Human', human: true }; delete f.human; }
    else if (a) f.plate = { name: a.name.replace(/\s*\(.*?\)\s*/g, '').trim(), sub: a.seat };
    else if (sl?.hot) f.plate = { name: 'Hot desk', sub: 'Drop-in', hot: true };
    else f.plate = { name: 'Open desk', sub: 'New bot', open: true };
  }
  for (const a of team.agents) if (!slotKind.has(a.home)) console.warn('team home slot missing:', a.id, a.home);
}

const world = {
  version: 2,
  units: 'floor-local; origin = floor centre; +x right, +z toward viewer; back walls at z=-14 and x=-22; y up',
  floorSize: { w: W, d: D },
  floorPitch: 28,
  wallHeight: WALL_H,
  slabThickness: 0.6,
  cameraHint: { allView: { fitW: 54, fitH: 108 }, floorView: { fitW: 54, fitH: 42 } },
  floors,
  elevator: { x: 18.5, z: -11.5, w: 4.5, d: 4.5, doorSide: '+z', doorZ: -9.25, doorW: 2.4, floorGap: 28, speed: 14 },
  stairs: { x: 12.5, z: -11.0, w: 5, d: 5.2, bottomLanding: { x: 10.4, z: -11 }, topLanding: { x: 14.6, z: -11 }, entry: { x: 12.5, z: -7.4 }, dir: '+x' },
  nav: { cell: 0.5, margin: 0.45, blockedFootprints: 'furniture[solid:true] + walls (except gaps) + elevator + stairs rects' },
  rooms, walls, furniture, slots, surfaces,
};

// compact pretty printer: one line per array element
const line = (o) => JSON.stringify(o);
const arr = (a) => '[\n' + a.map((x) => '    ' + line(x)).join(',\n') + '\n  ]';
const out = '{\n' + Object.entries(world).map(([k, v]) => `  ${JSON.stringify(k)}: ` + (Array.isArray(v) && v.length > 4 ? arr(v) : line(v))).join(',\n') + '\n}\n';
const dest = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'world.json');
writeFileSync(dest, out);
console.log(`wrote ${dest}: ${rooms.length} rooms, ${walls.length} walls, ${furniture.length} furniture, ${slots.length} slots, ${surfaces.length} surfaces`);
