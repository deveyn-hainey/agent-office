// Agents (S2): glossy bot characters, procedural animation, FSM, grid pathfinding, elevator/stairs travel, bubbles.
// Contract: docs/ARCHITECTURE.md §6. Additions are documented in docs/notes/s2.md.
import { STATES, colorFor, angDiff, clamp, hash } from '../core/util.js';
import { createMeepleFactory, applyRig, SCALE } from './meeple.js';
import { makeChannels, targetFor, stepChannels, POSE_PROPS } from './anim.js';
import { createNav } from './nav.js';
import { createBubbles } from './bubbles.js';
import { deriveState, statusColor, activityText, locationLabel } from './fsm.js';

const PI = Math.PI;
const WALK_SPEED = 3.1, RUN_SPEED = 5.8;
const EMOJI_RE = /^[\p{Extended_Pictographic}‍️\s]{1,8}$/u;

export function createAgents(ctx) {
  const { THREE, scene } = ctx.scene;
  const { bus, clock } = ctx;
  const world = ctx.world;
  const wd = ctx.data.world;
  const group = new THREE.Group();
  group.name = 'agents';
  scene.add(group);

  const nav = createNav(wd);
  const factory = createMeepleFactory(ctx);
  const bubbles = createBubbles(ctx);
  const agents = new Map();
  const reserved = new Map(); // slotId -> agentId
  const sleeps = [];
  const slotCache = new Map();
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const floorY = (f) => f * wd.floorPitch;
  const slotOf = (id) => {
    if (!id) return null;
    if (!slotCache.has(id)) slotCache.set(id, world.slot(id));
    return slotCache.get(id);
  };
  const rand01 = (a) => ((hash(a.id + ':' + a.rnd++) % 10000) / 10000);

  /* ------------------------------------------------------------------ build */
  for (const t of ctx.data.team.agents) {
    const color = colorFor(t);
    const rig = factory.build({ ...t, color });
    const anchor = new THREE.Object3D();
    anchor.position.y = rig.topY + 0.5;
    rig.root.add(anchor);
    const a = {
      id: t.id, team: t, name: t.name, short: t.short || t.name, role: t.role, color, home: t.home, startVisible: t.startVisible !== false,
      rig, root: rig.root, anchor, ctl: null,
      visible: false, floor: 0, x: 0, z: 0, y: 0, yaw: 0, baseYaw: 0, yawTarget: 0, headYaw: 0, headYawT: 0,
      slotId: null, slotKind: null, destSlot: null, arrived: true,
      status: 'resting', task: '', pose: 'stand', forced: null, timed: null, carry: null,
      ch: makeChannels(), snap: true, walk: null, mv: null, speed: 0, walkPh: 0, animT: hash(t.id) % 50, seed: (hash(t.id) % 628) / 100,
      look: null, autoLook: null, lookDwell: 0, idleLookT: 1 + (hash(t.id) % 30) / 10, idleYaw: 0, blinkT: 2 + (hash(t.id) % 30) / 10, blink: 0,
      riding: null, rideTo: 0, rideFollow: false, fade: 1, fadeT: 1, hasAlert: false, thinking: false, speakUntil: 0, listenUntil: 0,
      aim: 0, popT: 1, waitT: 0, rnd: 0, fsm: 'hidden', activity: '', wasZzz: false, lastPose: '', lastSig: '',
      stats: { tasksDone: 0, reviews: 0, coffees: 0, naps: 0, chats: 0, workSec: 0 },
    };
    a.ctl = bubbles.attach(t.id, anchor, { name: a.short, color: '#a49d90' });
    a.rig._fade = 1;
    group.add(a.root);
    a.root.visible = false;
    a.ctl.setVisible(false);
    agents.set(t.id, a);
  }
  const all = () => [...agents.values()];

  /* ------------------------------------------------------------------ reservations */
  function releaseOthers(a, keep) {
    for (const [k, v] of reserved) if (v === a.id && k !== keep) reserved.delete(k);
  }
  const holder = (sid) => {
    const id = reserved.get(sid);
    return id && agents.get(id)?.visible ? id : null;
  };
  function alternate(slot, a) {
    let best = null, bd = 1e9;
    for (const s of world.slots()) {
      if (s.kind !== slot.kind || s.floor !== slot.floor || (slot.room && s.room !== slot.room)) continue;
      const h = holder(s.id);
      if (h && h !== a.id) continue;
      const d = Math.hypot(s.x - slot.x, s.z - slot.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best?.id || slot.id;
  }
  function resolveSlot(spec, agentId) {
    if (!spec) return null;
    const a = agents.get(agentId);
    spec = String(spec).replace(/^slot:/, '');
    let sid = null;
    if (spec.startsWith('free:')) {
      const s = world.slots(spec.slice(5)).find((x) => { const h = holder(x.id); return !h || h === agentId; });
      sid = s?.id || null;
      if (!sid) return null;
    } else {
      const s = world.slot(spec);
      if (!s) { console.warn('[agents] unknown slot', spec); return null; }
      const h = holder(s.id);
      sid = h && h !== agentId && a ? alternate(s, a) : s.id;
    }
    reserved.set(sid, agentId);
    return sid;
  }

  /* ------------------------------------------------------------------ moves */
  function newMove(a) {
    const mv = { cancelled: false, handlers: [], cancel() { } };
    mv.cancelP = new Promise((res) => { mv.cancel = () => { if (mv.cancelled) return; mv.cancelled = true; for (const h of mv.handlers) { try { h(); } catch (e) { /* ignore */ } } res(false); }; });
    mv.race = (p) => Promise.race([Promise.resolve(p), mv.cancelP]);
    mv.onCancel = (fn) => mv.handlers.push(fn);
    a.mv = mv;
    return mv;
  }
  function cancelMove(a) {
    const mv = a.mv;
    a.mv = null;
    if (a.walk) { a.walk.res?.(false); a.walk = null; }
    if (a.riding) { a.riding = null; a.rideFollow = false; a.fadeT = 1; }
    a.speed = 0;
    if (mv) mv.cancel();
  }
  function sleep(mv, sec) {
    return new Promise((res) => { sleeps.push({ due: clock.t + sec, res }); mv.onCancel(res); });
  }

  function walkPts(a, mv, pts, { run = false } = {}) {
    return new Promise((res) => {
      if (mv.cancelled) return res(false);
      a.walk = { pts, i: 0, run, res };
    });
  }
  function walkTo(a, mv, x, z, { run = false, direct = false, facing } = {}) {
    let pts = direct ? [{ x, z }] : nav.findPath(a.floor, a.x, a.z, x, z, facing);
    if (!pts) { console.warn(`[agents] no path for ${a.id} on floor ${a.floor} to ${x},${z}`); pts = [{ x, z }]; }
    return mv.race(walkPts(a, mv, pts, { run }));
  }

  function placeAt(a, slot) {
    cancelMove(a);
    a.floor = slot.floor; a.x = slot.x; a.z = slot.z; a.y = floorY(slot.floor);
    a.slotId = slot.id; a.slotKind = slot.kind; a.destSlot = null; a.arrived = true;
    a.baseYaw = slot.facing + (slot.lie ? PI / 2 : 0);
    a.yaw = a.yawTarget = a.baseYaw; a.headYaw = a.headYawT = 0;
    a.forced = null; a.look = null; a.autoLook = null;
    a.snap = true; a.fade = a.fadeT = 1; a.speed = 0;
    syncRoot(a);
  }

  function arrive(a, slot, silent) {
    a.walk = null; a.speed = 0;
    a.slotId = slot.id; a.slotKind = slot.kind; a.destSlot = null; a.arrived = true;
    a.baseYaw = slot.facing + (slot.lie ? PI / 2 : 0);
    a.yawTarget = a.baseYaw;
    a.forced = null;
    a.waitT = 0;
    releaseOthers(a, slot.id);
    if (slot.kind === 'coffee') a.stats.coffees++;
    if (slot.kind === 'sofa' && slot.lie) a.stats.naps++;
    if (!silent) bus.emit('agent:arrive', { id: a.id, slot: slot.id, floor: a.floor });
  }

  function moveTo(id, spec, opts = {}) {
    const a = agents.get(id);
    if (!a) return Promise.resolve(false);
    const sid = resolveSlot(spec, id);
    if (!sid) return Promise.resolve(false);
    const slot = slotOf(sid);
    const from = a.slotId;
    releaseOthers(a, sid);
    cancelMove(a);
    a.look = null; a.autoLook = null; a.forced = null;
    if (clock.seeking || !a.visible) {
      placeAt(a, slot);
      if (a.visible) bus.emit('agent:arrive', { id, slot: sid, floor: a.floor });
      arrive(a, slot, true);
      settle(a);
      return Promise.resolve(true);
    }
    a.destSlot = sid; a.arrived = false;
    bus.emit('agent:depart', { id, from, to: sid });
    const mv = newMove(a);
    return runMove(a, slot, opts, mv);
  }

  async function runMove(a, slot, opts, mv) {
    try {
      const run = !!opts.run;
      while (a.floor !== slot.floor && !mv.cancelled) {
        const hop = Math.abs(slot.floor - a.floor) === 1;
        const via = opts.via || 'auto';
        const useStairs = world.stairs?.path && (via === 'stairs' || (via === 'auto' && hop && (hash(a.id + ':' + a.rnd++) % 100) < 30));
        const ok = useStairs ? await stairsTrip(a, mv, slot.floor, run) : await elevatorTrip(a, mv, slot.floor, run);
        if (!ok || mv.cancelled) return false;
      }
      if (mv.cancelled) return false;
      const ok = await walkTo(a, mv, slot.x, slot.z, { run, facing: slot.facing });
      if (!ok || mv.cancelled) return false;
      // let a turn-to-facing finish a bit before reporting; arrival itself is immediate
      arrive(a, slot);
      return true;
    } catch (e) {
      console.warn('[agents] move failed, teleporting', a.id, e);
      if (a.mv === mv) { placeAt(a, slot); arrive(a, slot); return true; }
      return false;
    } finally {
      if (a.mv === mv) a.mv = null;
    }
  }

  const waiting = new Map(); // floor -> [agentIds] queueing at the elevator

  const MAX_RIDERS = 3; // leader + up to two companions heading the same way share one car trip
  const RIDE_OFF = [{ x: -0.95, z: 0.25 }, { x: 0.95, z: 0.25 }];

  async function elevatorTrip(a, mv, to, run) {
    const from = a.floor;
    const E = world.elevator;
    const n = from + 1;
    const spots = [`elevator-${n}f`, `elevator-${n}f-2`, `elevator-${n}f-3`].map(slotOf).filter(Boolean);
    const q = waiting.get(from) || [];
    waiting.set(from, q);
    q.push(a.id);
    a.elev = { to, ready: false, join: null, taken: false };
    const joinP = new Promise((res) => { a.elev.join = res; });
    mv.onCancel(() => { const i = q.indexOf(a.id); if (i >= 0) q.splice(i, 1); a.elev = null; });
    const spot = spots[(q.indexOf(a.id)) % Math.max(1, spots.length)] || { x: wd.elevator.x, z: wd.elevator.doorZ + 1.5, facing: PI };
    const leaveQ = () => { const i = q.indexOf(a.id); if (i >= 0) q.splice(i, 1); };
    if (!(await walkTo(a, mv, spot.x, spot.z, { run, facing: spot.facing }))) { leaveQ(); return false; }
    a.baseYaw = a.yawTarget = spot.facing;
    if (!E?.acquire || !E.moveTo || !E.carPos) { leaveQ(); return fadeHop(a, mv, to, spot); }

    let release = null, released = false, joined = false;
    const rel = () => { if (!released && release) { released = true; try { release(); } catch (e) { /* ignore */ } } };
    mv.onCancel(rel);
    try {
      const acq = Promise.resolve(E.acquire()).then((r) => { release = r; if (mv.cancelled || joined) rel(); return r; });
      // while queueing, a car already loading for the same destination may pick this agent up
      a.elev.ready = true;
      const got = await mv.race(Promise.race([acq.then(() => null), joinP]));
      if (mv.cancelled) return false;
      leaveQ();
      if (got) { joined = true; return await passengerRide(a, mv, got, run); }
      a.elev = null;
      const carFloor = Math.round(E.carPos().y / wd.floorPitch);
      if (carFloor !== from) await mv.race(E.moveTo(from));
      if (mv.cancelled) return false;
      await mv.race(E.open(from));
      if (mv.cancelled) return false;
      // hold the doors for companions still walking over (same destination), then recruit everyone who is waiting
      for (let i = 0; i < 40 && !mv.cancelled; i++) {
        const pending = q.some((id) => { const b = agents.get(id); return id !== a.id && b?.elev && !b.elev.taken && !b.elev.ready && b.elev.to === to; });
        if (!pending) break;
        await mv.race(sleep(mv, 0.25));
      }
      if (mv.cancelled) return false;
      const trip = { from, to, riders: [], boarded: 0, closedP: null, arrivedP: null, closedRes: null, arrivedRes: null, cleared: 0, clearP: null, clearRes: null };
      trip.clearP = new Promise((r) => { trip.clearRes = r; });
      trip.cleared = 0;
      trip.closedP = new Promise((r) => { trip.closedRes = r; });
      trip.arrivedP = new Promise((r) => { trip.arrivedRes = r; });
      for (const id of [...q]) {
        if (trip.riders.length >= MAX_RIDERS - 1) break;
        const b = agents.get(id);
        if (b?.elev?.ready && !b.elev.taken && b.elev.to === to && b.elev.join) {
          b.elev.taken = true;
          trip.riders.push(b);
          b.elev.join({ trip, idx: trip.riders.length - 1 });
        }
      }
      const door = E.doorPos(from), car = E.carPos();
      if (!(await mv.race(walkPts(a, mv, [{ x: door.x, z: door.z }, { x: car.x, z: car.z }], { run: false })))) return false;
      a.yawTarget = a.baseYaw = 0;
      await mv.race(sleep(mv, 0.25));
      // wait (briefly) until the companions are aboard
      for (let i = 0; i < 40 && trip.boarded < trip.riders.length && !mv.cancelled; i++) await mv.race(sleep(mv, 0.15));
      await mv.race(E.close(from));
      if (mv.cancelled) return false;
      trip.closedRes();
      // ride
      a.riding = 'elevator'; a.rideTo = to; a.floor = to; a.rideFollow = true; a.fadeT = 0.3;
      bus.emit('agent:ride', { id: a.id, mode: 'elevator', from, to });
      await mv.race(E.moveTo(to));
      if (mv.cancelled) return false;
      a.rideFollow = false;
      await mv.race(E.open(to));
      if (mv.cancelled) return false;
      trip.arrivedRes();
      a.riding = null; a.fadeT = 1;
      const door2 = E.doorPos(to);
      const spots2 = [`elevator-${to + 1}f`, `elevator-${to + 1}f-2`, `elevator-${to + 1}f-3`].map(slotOf).filter(Boolean);
      const out = spots2[hash(a.id) % Math.max(1, spots2.length)];
      // step out of the car first; once everyone is clear the doors close and the car is free while we finish walking
      let ok = await mv.race(walkPts(a, mv, [{ x: door2.x, z: door2.z }], { run }));
      if (trip.riders.length) await mv.race(trip.clearP);
      Promise.resolve(E.close(to)).catch(() => {}).finally(rel);
      if (ok && out && !mv.cancelled) ok = await mv.race(walkPts(a, mv, [{ x: out.x, z: out.z }], { run }));
      return !!ok && !mv.cancelled;
    } finally {
      a.elev = null;
      if (mv.cancelled || a.riding) rel();
      leaveQ();
    }
  }

  // a companion who boards the car another agent has already acquired
  async function passengerRide(b, mv, { trip, idx }, run) {
    const E = world.elevator, { from, to } = trip;
    const off = RIDE_OFF[idx % RIDE_OFF.length];
    let cleared = false;
    const clear = () => { if (cleared) return; cleared = true; if (++trip.cleared >= trip.riders.length) trip.clearRes(); };
    const end = () => { b.rideFollow = false; b.rideOff = null; clear(); };
    mv.onCancel(end);
    try {
      const door = E.doorPos(from), car = E.carPos();
      if (!(await mv.race(walkPts(b, mv, [{ x: door.x + off.x * 0.3, z: door.z }, { x: car.x + off.x, z: car.z + off.z }], { run: false })))) return false;
      b.yawTarget = b.baseYaw = 0;
      trip.boarded++;
      await mv.race(trip.closedP);
      if (mv.cancelled) return false;
      b.riding = 'elevator'; b.rideTo = to; b.floor = to; b.rideFollow = true; b.rideOff = off; b.fadeT = 0.3;
      bus.emit('agent:ride', { id: b.id, mode: 'elevator', from, to });
      await mv.race(trip.arrivedP);
      if (mv.cancelled) return false;
      b.rideFollow = false; b.rideOff = null; b.riding = null; b.fadeT = 1;
      const door2 = E.doorPos(to);
      const spots2 = [`elevator-${to + 1}f`, `elevator-${to + 1}f-2`, `elevator-${to + 1}f-3`].map(slotOf).filter(Boolean);
      const out = spots2[(hash(b.id) + idx + 1) % Math.max(1, spots2.length)];
      let ok = await mv.race(walkPts(b, mv, [{ x: door2.x + off.x * 1.0, z: door2.z + 0.2 }], { run }));
      clear();
      if (ok && out && !mv.cancelled) ok = await mv.race(walkPts(b, mv, [{ x: out.x, z: out.z }], { run }));
      return !!ok && !mv.cancelled;
    } finally {
      end();
    }
  }

  async function fadeHop(a, mv, to, spot) {
    const from = a.floor;
    bus.emit('agent:ride', { id: a.id, mode: 'elevator', from, to });
    a.riding = 'elevator'; a.rideTo = to; a.fadeT = 0;
    await sleep(mv, 1.4);
    if (mv.cancelled) return false;
    const o = slotOf(`elevator-${to + 1}f`) || spot;
    a.floor = to; a.y = floorY(to); a.x = o.x; a.z = o.z;
    a.riding = null; a.fadeT = 1;
    return true;
  }

  async function stairsTrip(a, mv, to, run) {
    const n = a.floor + 1;
    const entry = slotOf(`stairs-${n}f`);
    if (entry && !(await walkTo(a, mv, entry.x, entry.z, { run, facing: entry.facing }))) return false;
    const step = to > a.floor ? 1 : -1;
    while (a.floor !== to) {
      const from = a.floor, next = from + step;
      const path = world.stairs.path(from, next);
      if (!path?.length) return false;
      bus.emit('agent:ride', { id: a.id, mode: 'stairs', from, to: next });
      a.riding = 'stairs'; a.rideTo = next;
      const pts = path.map((v) => ({ x: v.x, z: v.z, y: v.y }));
      a.floor = next;
      const ok = await mv.race(walkPts(a, mv, pts, { run }));
      a.riding = null;
      if (!ok || mv.cancelled) return false;
      a.y = floorY(next);
    }
    return true;
  }

  /* ------------------------------------------------------------------ look / poses */
  function resolveLook(target) {
    if (!target) return null;
    if (typeof target === 'object') {
      if (target.agent) return { agent: target.agent };
      return { floor: target.floor, x: target.x, z: target.z };
    }
    const m = String(target);
    const [kind, rest] = m.includes(':') ? [m.slice(0, m.indexOf(':')), m.slice(m.indexOf(':') + 1)] : ['', m];
    if (kind === 'agent' || (!kind && agents.has(rest))) return { agent: rest };
    if (kind === 'surface' || (!kind && world.surface?.(rest))) { const s = world.surface?.(rest); return s ? { floor: s.floor, x: s.x, z: s.z } : null; }
    const s = slotOf(rest);
    return s ? { floor: s.floor, x: s.x, z: s.z } : null;
  }
  function lookPoint(a, lk) {
    if (!lk) return null;
    if (lk.agent) { const o = agents.get(lk.agent); return o && o.visible && o.floor === a.floor && o !== a ? { x: o.x, z: o.z } : null; }
    return lk.floor === a.floor ? lk : null;
  }
  const isSeatedPose = (p) => p === 'sit' || p === 'sit-type' || p === 'nap' || p.startsWith('sit-');

  function defaultPose(a) {
    switch (a.slotKind) {
      case 'desk': return a.status === 'working' ? 'sit-type' : 'sit';
      case 'sofa': return 'nap';
      case 'coffee': return 'drink';
      case 'conf-seat': return 'sit';
      default: return 'stand';
    }
  }
  function effectivePose(a, now) {
    if (a.timed && now >= a.timed.until) a.timed = null;
    if (a.timed) return a.timed.pose;
    if (a.walk || (a.riding && a.rideFollow) || !a.arrived) return a.carry ? 'carry' : 'walk';
    if (a.riding) return 'stand';
    return a.forced || defaultPose(a);
  }

  /* ------------------------------------------------------------------ per-frame */
  const tmpV = new THREE.Vector3();
  const doorState = new Map();
  const doors = [];
  for (const w of wd.walls) {
    for (const g of w.gaps || []) {
      if (!g.door) continue;
      const horiz = w.z1 === w.z2;
      const mid = (g.from + g.to) / 2;
      doors.push({ name: g.door, floor: w.floor, x: horiz ? mid : w.x1, z: horiz ? w.z1 : mid });
    }
  }
  function updateDoors(now) {
    if (clock.seeking || !world.setDoor) return;
    for (const d of doors) {
      let near = false;
      for (const a of agents.values()) {
        if (!a.visible || a.floor !== d.floor || a.riding || isSeatedPose(a.pose)) continue;
        if (!a.walk && !(Math.hypot(a.x - d.x, a.z - d.z) < 1.4)) continue;
        if (Math.hypot(a.x - d.x, a.z - d.z) < 2.0) { near = true; break; }
      }
      let st = doorState.get(d.name);
      if (!st) { st = { open: false, last: -99 }; doorState.set(d.name, st); }
      if (near) st.last = now;
      if (near && !st.open) { st.open = true; Promise.resolve(world.setDoor(d.name, true)).catch(() => {}); }
      else if (!near && st.open && now - st.last > 1.5) { st.open = false; Promise.resolve(world.setDoor(d.name, false)).catch(() => {}); }
    }
  }

  function stepWalk(a, dt, now) {
    const w = a.walk;
    // stand up / get off the sofa before walking
    if (a.ch.sit > 0.5 || a.ch.lie > 0.5) { a.speed = 0; return; }
    const p = w.pts[w.i];
    let dx = p.x - a.x, dz = p.z - a.z;
    const dist = Math.hypot(dx, dz);
    const last = w.i === w.pts.length - 1;
    let vmax = w.run ? RUN_SPEED : WALK_SPEED;
    if (last) vmax *= clamp(dist / 1.1, 0.3, 1);
    if (dist > 0.01) { dx /= dist; dz /= dist; a.yawTarget = Math.atan2(dx, dz); }
    const turnErr = Math.abs(angDiff(a.yaw, a.yawTarget));
    if (turnErr > 1.0) vmax *= 0.2;
    // local avoidance
    let ax = 0, az = 0, slow = 1;
    for (const o of agents.values()) {
      if (o === a || !o.visible || o.floor !== a.floor || o.riding) continue;
      const ox = o.x - a.x, oz = o.z - a.z, d = Math.hypot(ox, oz);
      if (d > 1.25 || d < 0.001) continue;
      const rel = (ox * dx + oz * dz) / d;
      if (rel > 0.2) {
        const lat = ox * -dz + oz * dx;
        const side = Math.abs(lat) < 0.06 ? (hash(a.id) & 1 ? 1 : -1) : (lat > 0 ? -1 : 1);
        const k = (1.25 - d) / 1.25;
        ax += -dz * side * k * 1.7; az += dx * side * k * 1.7;
        if (d < 0.75 && rel > 0.7 && o.speed < 0.4) slow = Math.min(slow, 0.2);
        else if (d < 1.0) slow = Math.min(slow, 0.55);
      }
      if (d < 0.9) { ax -= (ox / d) * (0.9 - d) * 0.9; az -= (oz / d) * (0.9 - d) * 0.9; }
    }
    if (slow < 0.3) { a.waitT += dt; if (a.waitT > 1.6) slow = 0.6; } else a.waitT = Math.max(0, a.waitT - dt * 2);
    a.speed += (vmax * slow - a.speed) * (1 - Math.exp(-6 * dt));
    const step = a.speed * dt;
    if (dist <= Math.max(step, 0.06)) {
      a.x = p.x; a.z = p.z;
      if (p.y != null) a.y = p.y;
      w.i++;
      if (w.i >= w.pts.length) { a.walk = null; a.speed = 0; w.res(true); }
      return;
    }
    let mx = dx + ax, mz = dz + az;
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    let nx = a.x + mx * step, nz = a.z + mz * step;
    if (nav.blockedAt(a.floor, nx, nz) && !nav.blockedAt(a.floor, a.x, a.z) && (ax || az)) { nx = a.x + dx * step; nz = a.z + dz * step; }
    if (p.y != null && !a.rideFollow) {
      const total = Math.hypot(p.x - a.x, p.z - a.z) || 1;
      a.y += (p.y - a.y) * Math.min(1, Math.hypot(nx - a.x, nz - a.z) / total);
    }
    a.x = nx; a.z = nz;
    a.walkPh += step * 2.1 * (w.run ? 0.8 : 1);
  }

  function syncRoot(a) {
    a.root.position.set(a.x, a.y, a.z);
    a.root.rotation.y = a.yaw;
  }

  function updateAgent(a, dt, now, realDt) {
    if (!a.visible) return;
    a.animT += dt;
    const snap = a.snap || clock.seeking;
    const sub = Math.min(6, Math.ceil(dt / 0.05));
    // movement
    if (a.rideFollow && world.elevator?.carPos) {
      const c = world.elevator.carPos();
      a.x = c.x + (a.rideOff?.x || 0); a.z = c.z + (a.rideOff?.z || 0); a.y = c.y;
      a.speed = 0;
    } else if (a.walk) {
      for (let i = 0; i < sub && a.walk; i++) stepWalk(a, dt / sub, now);
    } else a.speed *= Math.exp(-10 * dt);
    if (!a.walk && !a.riding && a.arrived) a.y += (floorY(a.floor) - a.y) * (1 - Math.exp(-12 * dt));

    // pose + extras
    const pose = effectivePose(a, now);
    const speaking = now < a.speakUntil;
    const listening = now < a.listenUntil && !speaking;
    const walking = pose === 'walk' || pose === 'carry';
    let tpose = walking ? 'stand' : pose;
    if (pose === 'carry') tpose = 'carry';
    const extra = {};
    if (walking) { extra.walk = clamp(a.speed / WALK_SPEED, 0, 1.35); if (pose === 'carry') extra.swing = 0; }
    if (speaking && !walking) {
      if (tpose === 'stand') extra.talk = 1;
      else if (tpose === 'sit' || tpose === 'sit-type') extra.talk = 0.6;
      else if (tpose === 'present') extra.talk = 1;
    }
    if (listening && !walking && tpose === 'stand') Object.assign(extra, { nod: 1, aLx: -0.5, aLe: -1.6, aLz: -0.2, aRx: -0.5, aRe: -1.6, aRz: -0.2 });
    if (listening && (tpose === 'sit')) extra.nod = 1;
    if (tpose === 'stand' && !walking && !speaking && !listening && a.carry) Object.assign(extra, { aLx: -1.05, aRx: -1.05, aLe: -1.0, aRe: -1.0 });
    if (a.status === 'error' && tpose === 'sit-type') { extra.headP = 0.5; extra.type = 0.3; }
    if (a.fadeT < 1) extra.walk = 0;
    stepChannels(a.ch, targetFor(tpose, extra), dt, snap);
    a.snap = false;

    // prop visibility
    const props = [...(POSE_PROPS[pose] || [])];
    if (a.carry === 'binder') props.push('binder');
    if (a.carry === 'baton') props.push('baton');
    if (a.timed?.pose === 'vote') props.push('ballot');
    a.rig.setProp(props);
    if (a.timed?.card) a.rig.showCard(a.timed.card);

    // look + yaw
    let desired = null;
    const lk = a.look && now < a.look.until ? a.look : (a.autoLook && now < a.autoLook.until ? a.autoLook : null);
    if (a.look && now >= a.look.until) a.look = null;
    if (a.autoLook && now >= a.autoLook.until) a.autoLook = null;
    if (lk && !walking) {
      const lp = lookPoint(a, lk);
      if (lp) desired = Math.atan2(lp.x - a.x, lp.z - a.z);
    }
    const seated = isSeatedPose(pose);
    if (walking) {
      a.headYawT = 0; a.lookDwell = 0;
    } else if (desired != null) {
      const rel = angDiff(a.yaw, desired);
      a.headYawT = clamp(rel, seated ? -1.3 : -1.1, seated ? 1.3 : 1.1);
      a.lookDwell += dt;
      if (!seated && pose !== 'present' && pose !== 'draw' && (Math.abs(rel) > 1.0 || a.lookDwell > 0.35)) a.yawTarget = desired;
      a.aim += (clamp(rel, -2.2, 2.2) - a.aim) * (1 - Math.exp(-9 * dt));
    } else {
      a.lookDwell = 0;
      a.yawTarget = a.baseYaw;
      a.idleLookT -= dt;
      if (a.idleLookT <= 0) {
        a.idleLookT = 2 + rand01(a) * 4;
        a.idleYaw = (pose === 'stand' || pose === 'drink') ? (rand01(a) < 0.35 ? 0 : (rand01(a) - 0.5) * 1.5) : (seated && pose !== 'nap' ? (rand01(a) < 0.5 ? 0 : (rand01(a) - 0.5) * 0.7) : 0);
      }
      a.headYawT = pose === 'nap' ? 0 : a.idleYaw;
      a.aim += ((pose === 'present' ? 0.7 : 0) - a.aim) * (1 - Math.exp(-6 * dt));
    }
    if (snap) { a.headYaw = a.headYawT; if (!a.walk) a.yaw = a.yawTarget; }
    else {
      a.headYaw += (a.headYawT - a.headYaw) * (1 - Math.exp(-9 * dt));
      const dy = angDiff(a.yaw, a.yawTarget);
      const maxStep = (walking ? 9 : 7) * dt;
      a.yaw += clamp(dy * (1 - Math.exp(-(walking ? 11 : 8) * dt)), -maxStep, maxStep);
    }

    // blink
    a.blinkT -= dt;
    if (a.blinkT <= 0) { a.blinkT = 2.2 + rand01(a) * 3.5; a.blink = 1; }
    a.blink = Math.max(0, a.blink - dt * 8);

    // fade (elevator) + pop-in
    if (snap) a.fade = a.fadeT; else a.fade += (a.fadeT - a.fade) * (1 - Math.exp(-7 * dt));
    const fx = a.dim ? Math.min(a.fade, 0.16) : a.fade; // channel filter: bots outside the picked channel are greyed out
    if (Math.abs(fx - a.rig._fade) > 0.01) { a.rig.setFade(fx); a.rig._fade = fx; }
    if (a.popT < 1) a.popT = Math.min(1, a.popT + dt / 0.45);
    const pop = a.popT < 1 ? 1 + 0.18 * Math.sin(a.popT * PI) - (1 - a.popT) * (1 - a.popT) * 0.9 : 1;
    a.rig.inner.scale.setScalar(SCALE * clamp(pop, 0.05, 1.3));

    const lyingYaw = 0;
    a.rig.root.position.set(a.x, a.y, a.z);
    a.rig.root.rotation.y = a.yaw + lyingYaw;
    applyRig(a.rig, a.ch, { t: reducedMotion ? 0 : a.animT, ph: a.walkPh, headYaw: a.headYaw, blink: a.blink, aimR: a.aim, seed: a.seed });
    a.anchor.position.y = (a.rig.topY + 0.5 - 0.75 * a.ch.lie) * SCALE;

    // pose change bookkeeping
    if (pose !== a.lastPose) {
      if (a.lastPose !== 'walk' && a.lastPose !== 'carry' && pose !== 'walk' && pose !== 'carry') bus.emit('agent:pose', { id: a.id, pose });
      if (pose === 'present' && a.lastPose !== 'present') a.stats.reviews++;
      a.lastPose = pose;
    }
    a.pose = pose;
    const zzz = pose === 'nap' && a.arrived && !a.walk;
    if (zzz !== a.wasZzz) { a.ctl.zzz(zzz); a.wasZzz = zzz; }
    if (a.thinking && !a.ctl.isThinking()) a.thinking = false;
    if (a.status === 'working') a.stats.workSec += dt;
    a.rig.ring.rotation.y = 0;
  }

  // make pose/FSM reflect the final state right away (used by instant moves while seeking)
  function settle(a) {
    a.pose = effectivePose(a, clock.t);
    a.lastPose = a.pose;
    refreshFsm(a);
  }

  /* ------------------------------------------------------------------ FSM / snapshot */
  function refreshFsm(a) {
    a.slotKind = a.arrived ? a.slotKind : a.slotKind;
    a.speaking = clock.t < a.speakUntil;
    a.fsm = deriveState(a);
    a.activity = activityText(a, { world, slotOf: (x) => slotOf(x.slotId) });
    const col = statusColor(a);
    a.rig.ringColor(col);
    a.ctl.setStatusColor(col);
    const sig = a.fsm + '|' + a.activity + '|' + col + '|' + a.floor;
    if (sig !== a.lastSig) {
      a.lastSig = sig;
      bus.emit('agent:state', { id: a.id, fsm: a.fsm, state: a.fsm, activity: a.activity, statusColor: col, floor: a.floor });
    }
  }
  function snapshot(id) {
    const a = agents.get(id);
    if (!a) return null;
    refreshFsm(a);
    return {
      id: a.id, name: a.name, short: a.short, role: a.role, color: a.color, seat: a.team.seat, home: a.home, kind: a.team.kind,
      floor: a.floor, floorNo: a.floor + 1, slotId: a.slotId, visible: a.visible,
      state: a.fsm, status: a.status, statusColor: statusColor(a), activity: a.activity, task: a.task, pose: a.pose,
      alert: a.hasAlert, location: locationLabel(a, world), position: { x: a.x, y: a.y, z: a.z },
      stats: {
        tasksDone: a.stats.tasksDone, reviews: a.stats.reviews, coffees: a.stats.coffees, naps: a.stats.naps, chats: a.stats.chats,
        minutesWorking: Math.round((a.stats.workSec / 60) * 10) / 10,
      },
    };
  }
  const view = (a) => ({ id: a.id, name: a.name, role: a.role, color: a.color, floor: a.floor, slotId: a.slotId, status: a.status, task: a.task, visible: a.visible, pose: a.pose, home: a.home, state: a.fsm, activity: a.activity });

  let fsmT = 0;
  ctx.scene.addUpdate((dt, simT, realDt) => {
    const now = clock.t;
    for (let i = sleeps.length - 1; i >= 0; i--) if (now >= sleeps[i].due) { sleeps[i].res(true); sleeps.splice(i, 1); }
    for (const a of agents.values()) {
      const vis = a.visible && a.y <= floorY(floorCap) + 0.6; // floors above the focused one are faded out by the world
      if (a.root.visible !== vis) { a.root.visible = vis; a.ctl.setVisible(vis); }
      updateAgent(a, dt, now, realDt);
    }
    updateDoors(now);
    fsmT += realDt;
    if (fsmT > 0.25) { fsmT = 0; for (const a of agents.values()) if (a.visible) refreshFsm(a); }
    bubbles.update(now, dt, realDt, clock.seeking);
  });

  /* ------------------------------------------------------------------ public API */
  const api = {
    group,
    list: () => all().map(view),
    get: (id) => (agents.has(id) ? view(agents.get(id)) : null),
    snapshot, snapshots: () => all().map((a) => snapshot(a.id)),
    moveTo,
    teleport(id, spec) {
      const a = agents.get(id); const sid = resolveSlot(spec, id);
      if (!a || !sid) return;
      const slot = slotOf(sid);
      releaseOthers(a, sid);
      placeAt(a, slot); arrive(a, slot, true); settle(a);
      if (a.visible) bus.emit('agent:arrive', { id, slot: sid, floor: a.floor });
    },
    resolveSlot,
    occupant: (sid) => holder(sid),
    isArrived: (id) => { const a = agents.get(id); return !a || (a.arrived && !a.walk && !a.riding); },
    stop(id) {
      const a = agents.get(id); if (!a) return;
      cancelMove(a);
      a.arrived = true; a.destSlot = null;
    },

    say(id, text, opts = {}) {
      const a = agents.get(id); if (!a || !a.visible) return;
      const style = opts.style || 'speech';
      const t = String(text ?? '');
      const instant = clock.seeking;
      if (style === 'think') {
        const dur = (opts.ms ?? 3500) / 1000;
        a.ctl.say('', 'think', clock.t + dur, true);
        a.thinking = true;
      } else if (style === 'alert') {
        a.ctl.say(t || '!', 'alert', clock.t + (opts.ms ?? 3500) / 1000, true);
      } else if (style === 'cheer' && (!t || EMOJI_RE.test(t))) {
        api.react(id, t || '🎉', opts.ms ?? 2200);
        api.setPose(id, 'cheer', { ms: Math.min(opts.ms ?? 2200, 2400) });
      } else if (EMOJI_RE.test(t.trim()) && style === 'speech') {
        api.react(id, t.trim(), opts.ms ?? 2200);
      } else {
        const dur = Math.max(opts.ms ?? 3500, 1500 + t.length * 32) / 1000;
        a.ctl.say(t, 'speech', clock.t + dur, instant);
        a.speakUntil = clock.t + Math.min(dur, 0.6 + t.length * 0.045);
        a.stats.chats++;
        // nearby idle agents turn their heads and nod along
        for (const o of agents.values()) {
          if (o === a || !o.visible || o.floor !== a.floor || o.walk || o.riding) continue;
          if (Math.hypot(o.x - a.x, o.z - a.z) > 10) continue;
          if (!o.look) o.autoLook = { agent: id, until: a.speakUntil + 0.8 };
          o.listenUntil = a.speakUntil;
        }
        if (style === 'cheer') api.setPose(id, 'cheer', { ms: 1800 });
      }
      bus.emit('agent:bubble', { id, text: t, style });
    },
    react(id, emoji, ms = 2000) {
      const a = agents.get(id); if (!a || !a.visible) return;
      a.ctl.emojiShow(emoji, clock.t + ms / 1000);
      bus.emit('agent:bubble', { id, text: emoji, style: 'emoji' });
    },
    clearBubble(id) { const a = agents.get(id); if (a) { a.ctl.clearSpeech(); a.ctl.emoji?.el.remove(); a.ctl.emoji = null; a.thinking = false; a.speakUntil = 0; } },
    setAlert(id, on) {
      const a = agents.get(id); if (!a) return;
      a.hasAlert = !!on; a.ctl.alert(!!on);
      bus.emit('agent:alert', { id, on: !!on });
    },
    ballot(id, choice) {
      const a = agents.get(id); if (!a) return;
      choice = choice === 'no' ? 'no' : 'yes';
      if (a.visible) {
        a.ctl.ballot(choice, clock.t + 2.5);
        if (!clock.seeking) { a.timed = { pose: 'vote', until: clock.t + 2.5, card: choice }; a.rig.showCard(choice); }
        world.fx?.('ballot', a.floor, a.x, a.z);
      }
      bus.emit('agent:ballot', { id, choice });
    },
    lookAt(id, target, opts = {}) {
      const a = agents.get(id); if (!a) return;
      const lk = resolveLook(target);
      if (!lk) { a.look = null; return; }
      a.look = { ...lk, until: clock.t + (opts.ms ?? 6000) / 1000 };
      a.lookDwell = 0;
      if (clock.seeking) a.snap = true;
    },
    setPose(id, pose, opts = {}) {
      const a = agents.get(id); if (!a) return;
      if (pose === 'walk') return;
      if (opts.ms && !clock.seeking) a.timed = { pose, until: clock.t + opts.ms / 1000 };
      else if (!opts.ms) { a.forced = pose; a.timed = null; }
      if (pose === 'cheer' || pose === 'wave') { /* timed gestures revert on their own */ }
      if (clock.seeking) a.snap = true;
      if (a.visible && pose !== a.pose) bus.emit('agent:pose', { id, pose });
    },
    carry(id, what) { const a = agents.get(id); if (a) { a.carry = what || null; } },
    setStatus(id, status, task = '') {
      const a = agents.get(id); if (!a || !STATES[status]) return;
      if (status === 'finished' && a.status !== 'finished') a.stats.tasksDone++;
      a.status = status; a.task = task || '';
      refreshFsm(a);
      bus.emit('agent:status', { id, state: status, task: a.task, fsm: a.fsm });
    },
    spawn(id, spec) {
      const a = agents.get(id); if (!a) return Promise.resolve(false);
      const sid = resolveSlot(spec || a.home, id); if (!sid) return Promise.resolve(false);
      const slot = slotOf(sid);
      a.visible = true; a.root.visible = true; a.ctl.setVisible(true);
      releaseOthers(a, sid);
      placeAt(a, slot); arrive(a, slot, true);
      a.popT = clock.seeking ? 1 : 0;
      world.fx?.('puff', a.floor, a.x, a.z);
      bus.emit('agent:arrive', { id, slot: sid, floor: a.floor });
      return clock.seeking ? Promise.resolve(true) : new Promise((res) => sleeps.push({ due: clock.t + 0.45, res: () => res(true) }));
    },
    despawn(id) {
      const a = agents.get(id); if (!a) return;
      if (a.visible && !clock.seeking) world.fx?.('puff', a.floor, a.x, a.z);
      cancelMove(a);
      a.visible = false; a.root.visible = false; a.ctl.setVisible(false); a.ctl.clear();
      a.hasAlert = false; a.arrived = true; a.fsm = 'hidden';
      for (const [k, v] of reserved) if (v === id) reserved.delete(k);
    },
    getWorldPosition(id) { const a = agents.get(id); return a ? new THREE.Vector3(a.x, a.y + 0.95, a.z) : null; },
    getFloor: (id) => agents.get(id)?.floor ?? 0,
    pickables: () => all().filter((a) => a.root.visible).map((a) => a.root),
    /** channel filter: grey out every bot not in `keep` (a Set of ids); null = nobody dimmed */
    setDimmed(keep) {
      for (const a of agents.values()) { a.dim = !!keep && !keep.has(a.id); a.ctl.setDim?.(a.dim); if (a.dim) a.ctl.clearSpeech?.(); }
      bus.emit('agents:dimmed', { keep: keep ? [...keep] : null });
    },
    isDimmed: (id) => !!agents.get(id)?.dim,
    reset() {
      reserved.clear();
      for (const a of agents.values()) {
        cancelMove(a);
        a.ctl.clear();
        a.hasAlert = false; a.thinking = false; a.speakUntil = 0; a.listenUntil = 0; a.carry = null; a.timed = null; a.forced = null;
        a.status = 'resting'; a.task = ''; a.look = null; a.autoLook = null; a.popT = 1;
        a.stats = { tasksDone: 0, reviews: 0, coffees: 0, naps: 0, chats: 0, workSec: 0 };
        a.visible = a.startVisible;
        a.root.visible = a.visible; a.ctl.setVisible(a.visible);
        const slot = slotOf(a.home);
        if (slot) { placeAt(a, slot); a.slotKind = slot.kind; }
        if (a.visible && slot) reserved.set(slot.id, a.id);
        a.lastPose = ''; a.wasZzz = false; a.ctl.zzz(false);
        refreshFsm(a);
      }
      for (const q of waiting.values()) q.length = 0;
    },

    // ---- additions (see docs/notes/s2.md)
    pathTo(id, spec) { // preview a grid path on the agent's floor (no movement)
      const a = agents.get(id); const s = slotOf(String(spec).replace(/^slot:/, ''));
      return a && s ? nav.findPath(a.floor, a.x, a.z, s.x, s.z, s.facing) : null;
    },
    debug() {
      return { floors: wd.floors.map((_, f) => nav.debug(f)), reserved: Object.fromEntries(reserved), agents: all().map((a) => ({ id: a.id, floor: a.floor, x: a.x, z: a.z, fsm: a.fsm, pose: a.pose, walk: a.walk?.pts })) };
    },
    showNavDebug(on = true) {
      for (let f = 0; f < wd.floors.length; f++) {
        const fg = world.floorGroup(f);
        const old = fg.getObjectByName('s2-nav-debug'); if (old) fg.remove(old);
        if (!on) continue;
        const d = nav.debug(f);
        const pos = new Float32Array(d.cells.length * 3);
        d.cells.forEach(([x, z], i) => { pos[i * 3] = x; pos[i * 3 + 1] = 0.08; pos[i * 3 + 2] = z; });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e25a4f', size: 0.22, sizeAttenuation: true }));
        pts.name = 's2-nav-debug'; pts.userData.noPick = true; fg.add(pts);
      }
    },
  };

  // name tags only in floor / desk views; agents above the focused floor are hidden (mirrors the world's floor fading)
  const nF = wd.floors.length;
  let floorCap = nF - 1;
  const applyView = (view) => {
    bubbles.setTags(!!view && view.type !== 'all');
    if (!view) return;
    if (view.type === 'floor') floorCap = view.floor;
    else if (view.type === 'desk') floorCap = agents.get(view.agent)?.floor ?? nF - 1;
    else floorCap = nF - 1;
  };
  bus.on('cam:view', ({ view }) => applyView(view));
  bus.on('world:floors', ({ upTo }) => { if (Number.isInteger(upTo)) floorCap = upTo; });
  try { applyView(ctx.cam?.getView?.()); } catch (e) { applyView({ type: 'floor', floor: nF - 1 }); }

  api.reset();
  if (ctx.params?.debug) api.showNavDebug(true);
  return api;
}
