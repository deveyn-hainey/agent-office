// World (S1): builds the whole office from data/world.json. Entry: createWorld(ctx) -> world (docs/ARCHITECTURE.md §5).
// Files: batch.js (geometry batching) · textures.js · building.js (slab/walls/glass rooms/annotations) · props.js (furniture)
//        core.js (elevator + stairs) · surfaces.js (live canvas boards/screens) · lighting.js (day/night) · fx.js (particles)
import { applySurfaceOp } from '../core/surfaceops.js';
import { OUTLINE } from '../core/util.js';
import { denverNow } from '../core/clock.js';
import { Batch, shade } from './batch.js';
import { createTextures } from './textures.js';
import { buildShell, buildGlass, buildAnnotations } from './building.js';
import { buildProps } from './props.js';
import { buildCore, createElevator, STAIR } from './core.js';
import { createSurfaces } from './surfaces.js';
import { createLighting } from './lighting.js';
import { createFx } from './fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FADE = 0.35;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createWorld(ctx) {
  const { THREE: T, scene: scene3, lights, renderer, camera } = ctx.scene;
  const { bus, clock } = ctx;
  const data = ctx.data.world;
  const nF = data.floors.length;
  const group = new T.Group();
  group.name = 'world';
  scene3.add(group);
  const floorY = (i) => i * data.floorPitch;

  const tex = createTextures(T);

  /* ---------- per-floor shared materials ---------- */
  const mkInUse = (txt, bg) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 80;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2622'; g.beginPath(); g.roundRect(2, 2, 252, 76, 28); g.fill();
    g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, 240, 64, 24); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 40px ui-sans-serif,system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 128, 42);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
  };
  const inUseTex = { free: mkInUse('FREE', '#3fae5a'), busy: mkInUse('IN USE', '#e25a4f') };

  const floorMats = [];
  const makeMats = (i) => {
    const M = {
      vc: new T.MeshLambertMaterial({ vertexColors: true }),
      glass: new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false }),
      doorGlass: new T.MeshLambertMaterial({ color: '#cfeaf4', transparent: true, opacity: 0.3, depthWrite: false }),
      metal: new T.MeshLambertMaterial({ color: '#d9dde3' }),
      screen: {
        off: new T.MeshBasicMaterial({ color: '#232a33' }),
        idle: new T.MeshBasicMaterial({ map: tex.idle }),
        code: tex.code.map((t) => new T.MeshBasicMaterial({ map: t })),
      },
      rack: new T.MeshBasicMaterial({ map: tex.rack }),
      sky: new T.MeshBasicMaterial({ map: tex.sky }),
      patch: new T.MeshBasicMaterial({ color: '#fff2c4', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
      lampPool: new T.MeshBasicMaterial({ map: tex.glow, color: '#ffc861', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }),
      inUse: { free: new T.MeshBasicMaterial({ map: inUseTex.free }), busy: new T.MeshBasicMaterial({ map: inUseTex.busy }) },
    };
    M.lineMat = new T.LineBasicMaterial({ color: OUTLINE });
    return M;
  };

  const anim = { plants: [], clocks: [], screens: new Map(), bubbles: [], rackLast: 0 };
  const floorGroups = [];
  const steamPts = [];
  const sharedLine = new T.LineBasicMaterial({ color: OUTLINE });
  const envs = [];

  for (let i = 0; i < nF; i++) {
    const f = data.floors[i];
    const g = new T.Group();
    g.name = `floor-${f.id}`;
    g.position.y = floorY(i);
    group.add(g);
    floorGroups.push(g);
    const mats = makeMats(i);
    floorMats.push(mats);
    const env = {
      T, floor: i, accent: f.accent, data, group: g, b: new Batch(T), mats, tex, lineMat: mats.lineMat, Batch, anim,
      scene: ctx.scene, poolGeos: [], skyGeos: [], patchGeos: [], steam: [], doors: [], cores: null, worldGroup: group,
    };
    envs.push(env);
  }
  const cores = [];
  for (const env of envs) env.cores = cores;
  for (const env of envs) {
    buildShell(env);
    buildProps(env);
    buildGlass(env);
    buildCore(env);
    cores[env.floor] = env.core;
    buildAnnotations(env);
    env.b.build(env.group, env.mats.vc, env.lineMat, `static-${env.floor}`);
    if (env.glassBatch) env.glassBatch.build(env.group, env.mats.glass, env.lineMat, 'shaft-glass');
    const merged = (geos, mat, order) => {
      if (!geos.length) return;
      const m = new T.Mesh(mergeGeometries(geos), mat);
      m.userData.noPick = true; m.renderOrder = order; env.group.add(m);
    };
    merged(env.skyGeos, env.mats.sky, 0);
    merged(env.patchGeos, env.mats.patch, 2);
    merged(env.poolGeos, env.mats.lampPool, 2);
    for (const s of env.steam) steamPts.push({ ...s, floor: env.floor });
  }
  const doors = envs.flatMap((e) => e.doors);
  const doorMap = new Map(doors.map((d) => [d.id, d]));

  /* ---------- room pick proxies (invisible floor quads) ---------- */
  const roomProxies = [];
  for (const r of data.rooms) {
    if (r.annot === false) continue;
    const m = new T.Mesh(new T.PlaneGeometry(r.w, r.d), new T.MeshBasicMaterial({ visible: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(r.x, 0.12, r.z);
    m.userData.pick = { type: 'room', id: r.id, floor: r.floor };
    floorGroups[r.floor].add(m);
    roomProxies.push(m);
  }

  /* ---------- elevator ---------- */
  const carLineMat = new T.LineBasicMaterial({ color: OUTLINE });
  const elevEnv = { T, data, clock, bus, floorY, cores, Batch, lineMat: carLineMat, carLineMat, worldGroup: group };
  const elev = createElevator(elevEnv);

  /* ---------- surfaces ---------- */
  const surfDef = new Map(data.surfaces.map((s) => [s.id, s]));
  const surfState = new Map(data.surfaces.map((s) => [s.id, {}]));
  const surfaces = createSurfaces({ THREE: T, bus, clock, defs: data.surfaces, floorGroups, lineMat: sharedLine, team: ctx.data.team, getState: (id) => surfState.get(id) || {} });
  for (const d of data.surfaces) {
    const sg = surfaces.group(d.id);
    if (sg) sg.userData.surfaceId = d.id;
    sg?.traverse((o) => { if (o.material === sharedLine) o.material = floorMats[d.floor].lineMat; });
    try { surfaces.render(d.id, surfState.get(d.id), { op: 'init' }); } catch (e) { console.warn('[world] surface init', d.id, e); }
  }

  /* ---------- lighting + fx ---------- */
  const lighting = createLighting({ T, scene3, lights, tex, floorMats, clock, renderer, denverNow });
  const fxsys = createFx(T, group, () => renderer.domElement.height / Math.max(1, camera.top - camera.bottom));

  /* ============================================================ floor visibility */
  let upTo = nF - 1, annotFloor = -1, annotOverride = null;
  const alpha = Array(nF).fill(1), target = Array(nF).fill(1);
  const matCache = new Array(nF).fill(null);
  // when a floor is the top visible one, cut the tall stair tower / elevator tube just above its ceiling
  renderer.localClippingEnabled = true;
  const clipPlanes = Array.from({ length: nF }, () => new T.Plane(new T.Vector3(0, -1, 0), 1e6));
  const getMats = (i) => {
    if (matCache[i]) return matCache[i];
    const set = new Set();
    floorGroups[i].traverse((o) => {
      if (o.userData?.isLabel || o.isCSS2DObject) return;
      const m = o.material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) set.add(mm);
    });
    for (const mm of set) {
      if (mm.userData.baseOpacity === undefined) { mm.userData.baseOpacity = mm.opacity; mm.userData.baseTransparent = mm.transparent; }
      mm.clippingPlanes = [clipPlanes[i]];
    }
    return (matCache[i] = [...set]);
  };
  const applyAlpha = (i) => {
    const a = alpha[i];
    for (const m of getMats(i)) {
      if (a >= 0.999) { m.opacity = m.userData.baseOpacity; m.transparent = m.userData.baseTransparent; }
      else { m.transparent = true; m.opacity = m.userData.baseOpacity * a; }
    }
    floorGroups[i].visible = a > 0.01;
  };
  const refreshAnnot = () => {
    for (const env of envs) {
      const on = annotOverride !== null ? annotOverride && (annotFloor < 0 || env.floor === annotFloor || annotOverride === 'all') : env.floor === annotFloor;
      const vis = !!on && alpha[env.floor] > 0.5;
      if (env.annot) {
        env.annot.group.visible = vis;
        for (const l of env.annot.labels) l.visible = vis;
      }
    }
  };
  function setFloorVisibility(top, instant = false) {
    upTo = Math.max(-1, Math.min(nF - 1, top));
    for (let i = 0; i < nF; i++) target[i] = i <= upTo ? 1 : 0;
    if (instant || clock.seeking) { for (let i = 0; i < nF; i++) { alpha[i] = target[i]; applyAlpha(i); } }
    for (let i = 0; i < nF; i++) { getMats(i); clipPlanes[i].constant = i === upTo && i < nF - 1 ? floorY(i) + data.wallHeight + 1.5 : 1e6; }
    refreshAnnot();
    bus.emit('world:floors', { upTo, annotFloor });
  }
  function applyView(view) {
    if (!view) return;
    if (view.type === 'floor') { annotFloor = view.floor; setFloorVisibility(view.floor); }
    else if (view.type === 'desk') {
      annotFloor = -1;
      const f = ctx.agents?.getFloor?.(view.agent);
      setFloorVisibility(Number.isInteger(f) ? f : nF - 1);
    } else { annotFloor = -1; setFloorVisibility(nF - 1); }
  }
  bus.on('cam:view', ({ view }) => applyView(view));
  applyView(ctx.cam?.getView?.() || { type: 'all' });
  for (let i = 0; i < nF; i++) { alpha[i] = target[i]; applyAlpha(i); }

  /* ============================================================ doors */
  const roomOfDoor = (id) => { const m = /door-(\d)f-(\w)/.exec(id); return m ? data.rooms.find((r) => r.id === `conf-${m[2]}-${m[1]}f`) : null; };
  function setDoor(id, open) {
    const d = doorMap.get(id);
    if (!d) { console.warn('[world] unknown door', id); return Promise.resolve(); }
    const tgt = open ? 1 : 0;
    const changed = d.target !== tgt;
    d.target = tgt;
    if (changed) bus.emit('door:state', { id, open: !!open });
    if (clock.seeking || Math.abs(d.amt - tgt) < 0.001) { d.amt = tgt; placeDoor(d); setSign(d); return Promise.resolve(); }
    return new Promise((res) => d.waiters.push(res));
  }
  const placeDoor = (d) => {
    const u = d.closedU + d.openDelta * d.amt;
    if (d.horiz) d.leaf.position.x = u; else d.leaf.position.z = u;
  };
  const setSign = (d) => {
    const busy = d.inUse || d.amt > 0.05 || d.target > 0;
    d.sign.material = busy ? floorMats[d.floor].inUse.busy : floorMats[d.floor].inUse.free;
  };
  const doorsApi = {
    openDoor: (id) => setDoor(id, true),
    closeDoor: (id) => setDoor(id, false),
    /** positions: [{floor,x,z}] — opens doors within 1.8 of any position, closes the rest */
    autoDoors(positions = []) {
      for (const d of doors) {
        const gp = d.horiz ? { x: d.closedU, z: d.z + 0.17 } : { x: d.z + 0.17, z: d.closedU };
        const near = positions.some((p) => p.floor === d.floor && Math.hypot(p.x - gp.x, p.z - gp.z) < 1.8);
        if (near !== (d.target > 0)) setDoor(d.id, near);
      }
    },
    setRoomInUse(doorOrRoomId, on) {
      for (const d of doors) if (d.id === doorOrRoomId || roomOfDoor(d.id)?.id === doorOrRoomId) { d.inUse = !!on; d.forced = true; setSign(d); }
    },
  };
  let inUseTimer = 0;
  function pollInUse(dt) {
    inUseTimer += dt;
    if (inUseTimer < 0.5) return;
    inUseTimer = 0;
    const ag = ctx.agents;
    if (!ag?.list) return;
    const list = ag.list().filter((a) => a.visible !== false);
    for (const d of doors) {
      const r = roomOfDoor(d.id);
      if (!r) continue;
      const inside = list.some((a) => {
        if (a.floor !== d.floor) return false;
        const p = ag.getWorldPosition?.(a.id);
        return p && Math.abs(p.x - r.x) < r.w / 2 - 0.3 && Math.abs(p.z - r.z) < r.d / 2 - 0.3;
      });
      if (inside !== d.inUse) { d.inUse = inside; setSign(d); }
    }
  }

  /* ============================================================ desk screens */
  function setDeskScreen(slotId, mode) {
    const s = anim.screens.get(slotId);
    if (!s) return false;
    s.mode = mode;
    const m = floorMats[s.floorIdx ?? 0].screen;
    if (mode === 'off') s.mesh.material = m.off;
    else if (mode === 'working') { s.variant = Math.floor(Math.random() * 3); s.mesh.material = m.code[s.variant]; s.next = 0; }
    else s.mesh.material = m.idle;
    return true;
  }
  // tag each screen with its floor (props only know the slot id)
  for (const [id, s] of anim.screens) {
    const slot = data.slots.find((x) => x.id === id);
    s.floorIdx = slot ? slot.floor : 0;
    s.mesh.material = floorMats[s.floorIdx].screen.idle;
    s.next = 1e9;
  }
  const statusScreen = (agentId) => {
    const a = ctx.agents?.get?.(agentId);
    if (!a || !a.slotId) return;
    if (anim.screens.has(a.slotId)) setDeskScreen(a.slotId, a.status === 'working' ? 'working' : a.visible === false ? 'off' : 'idle');
  };
  bus.on('agent:arrive', ({ id, slot }) => { if (anim.screens.has(slot)) { const a = ctx.agents?.get?.(id); setDeskScreen(slot, a?.status === 'working' ? 'working' : 'idle'); } });
  bus.on('agent:depart', ({ from }) => { if (from && anim.screens.has(from)) setDeskScreen(from, 'off'); });
  bus.on('agent:status', ({ id, state }) => {
    const a = ctx.agents?.get?.(id);
    const slot = a?.slotId;
    if (slot && anim.screens.has(slot)) setDeskScreen(slot, state === 'working' ? 'working' : 'idle');
  });
  void statusScreen;

  /* ============================================================ surfaces API + slack mirror */
  const surfApi = {
    list: (floor) => data.surfaces.filter((s) => floor == null || s.floor === floor).map((s) => s.id),
    get: (id) => surfState.get(id) ?? null,
    update(id, op, payload) {
      if (!surfDef.has(id)) { console.warn('[world] unknown surface', id); return null; }
      const next = applySurfaceOp(surfState.get(id), op, payload);
      surfState.set(id, next);
      try { surfaces.render(id, next, { op, data: payload }); } catch (e) { console.warn('[world] surface render', id, e); }
      bus.emit('surface:update', { id, kind: surfDef.get(id).kind, op, data: payload, state: next });
      return next;
    },
  };
  bus.on('slack:message', (m) => {
    if (!surfDef.has('slack-1f') || !m) return;
    const st = surfState.get('slack-1f') || {};
    const item = { who: m.you ? 'You' : m.who, text: m.text, ts: m.ts ?? clock.simDate().getTime() };
    const next = { ...st, channel: m.channel || st.channel || 'pitchside-dev', messages: [...(st.messages || []), item].slice(-14) };
    surfState.set('slack-1f', next);
    try { surfaces.render('slack-1f', next, { op: 'push', data: { path: 'messages', item } }); } catch (e) { console.warn(e); }
    bus.emit('surface:update', { id: 'slack-1f', kind: 'slack', op: 'push', data: { path: 'messages', item }, state: next });
  });

  /* ============================================================ API */
  const slotMap = new Map(data.slots.map((s) => [s.id, s]));
  const roomMap = new Map(data.rooms.map((r) => [r.id, r]));
  const withWorld = (s) => (s ? { ...s, wx: s.x, wy: floorY(s.floor), wz: s.z } : null);
  const toWorld = (floor, x, z, y = 0) => new T.Vector3(x, floorY(floor) + y, z);

  const { rise, flights, xA, xB, laneA, laneB } = STAIR;
  const stairsApi = {
    path(from, to) {
      if (from === to) return [];
      const up = to > from, f0 = Math.min(from, to), f1 = Math.max(from, to);
      const list = [];
      for (let g = f0 * flights; g < f1 * flights; g++) {
        const even = (g % flights) % 2 === 0, yb = g * rise;
        list.push(new T.Vector3(even ? xA : xB, yb, even ? laneA : laneB), new T.Vector3(even ? xB : xA, yb + rise, even ? laneA : laneB));
      }
      const e = data.stairs.entry;
      return [new T.Vector3(e.x, floorY(from), e.z), ...(up ? list : list.reverse()), new T.Vector3(e.x, floorY(to), e.z)];
    },
  };

  // pending mural completion
  let muralWait = null;

  const world = {
    data, group, THREE: T,
    floorGroup: (i) => floorGroups[i],
    floorY, toWorld,
    slot: (id) => withWorld(slotMap.get(id)),
    slots: (prefix) => data.slots.filter((s) => !prefix || s.id.startsWith(prefix)).map(withWorld),
    room: (id) => roomMap.get(id) || null,
    rooms: (floor) => data.rooms.filter((r) => floor == null || r.floor === floor),
    surface: (id) => { const d = surfDef.get(id); return d ? { ...d, state: surfState.get(id) } : null; },
    surfaces: surfApi,
    setDoor,
    elevator: elev.api,
    stairs: stairsApi,
    fx(kind, floor, x, z) {
      if (floor > upTo || !fxsys.kinds[kind]) return;
      fxsys.spawn(kind, x, floorY(floor), z);
    },
    /** raycast helper for the UI: -> {pick, hit, point} | null (only visible floors) */
    pick: (clientX, clientY) => ctx.scene.pick(clientX, clientY, world.pickables()),
    pickables() {
      const out = [];
      for (const g of surfaces.pickables) if (g.userData.pick.floor <= upTo) out.push(g);
      for (const d of doors) if (d.floor <= upTo) out.push(d.leaf);
      for (const p of roomProxies) if (p.userData.pick.floor <= upTo && floorGroups[p.userData.pick.floor].visible) out.push(p);
      return out;
    },
    reset() {
      for (const d of data.surfaces) { surfState.set(d.id, {}); try { surfaces.render(d.id, {}, { op: 'clear' }); } catch (e) { console.warn(e); } }
      surfaces.reset?.();
      for (const d of doors) { d.target = 0; d.amt = 0; d.inUse = false; for (const w of d.waiters.splice(0)) w(); placeDoor(d); setSign(d); }
      elev.reset();
      for (const id of anim.screens.keys()) setDeskScreen(id, 'idle');
      muralWait = null;
    },

    /* ---- additions (docs/notes/s1.md) ---- */
    setTimeOfDay: (v) => lighting.setTimeOfDay(v),
    getTimeOfDay: () => lighting.state(),
    setDeskScreen, getDeskScreen: (id) => anim.screens.get(id)?.mode ?? null,
    ...doorsApi,
    /** true/false forces the dotted room labels on/off for the current floor; null/'auto' = follow the camera (floor view only) */
    setAnnotations(on) { annotOverride = on === 'auto' || on == null ? null : !!on; refreshAnnot(); },
    setFloorVisibility, visibleFloors: () => upTo, floorVisible: (i) => i <= upTo,
    /** draw a generic placeholder badge on the lobby mural (≈3 s stroke animation). resolves when finished */
    drawMural(text, opts = {}) {
      surfApi.update('mural-1f', 'set', { badge: { text: String(text || 'Pitchside').slice(0, 40), color: opts.color } });
      if (clock.seeking) return Promise.resolve();
      return new Promise((res) => { muralWait = { until: clock.t + (opts.duration ?? 3.4), res }; });
    },
    clearMural: () => surfApi.update('mural-1f', 'clear', {}),
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    lighting,
  };

  // UI routine toggle: day/night lighting off -> lock to a neutral midday
  bus.on('routine:toggle', ({ id, on }) => { if (id === 'daynight') lighting.setTimeOfDay(on ? null : 12); });

  /* ============================================================ per-frame */
  const dn = { snap: clock.denver(), at: performance.now() };
  let rackT = 0, steamT = 0, flickT = 0, simAcc = 0;
  const m4 = new T.Matrix4(), q0 = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), v3 = new T.Vector3();
  let viewTimer = 0;

  ctx.scene.addUpdate((dt, simT, realDt) => {
    simAcc += dt;
    // fade floors
    for (let i = 0; i < nF; i++) {
      if (alpha[i] !== target[i]) {
        alpha[i] += Math.sign(target[i] - alpha[i]) * Math.min(Math.abs(target[i] - alpha[i]), realDt / FADE);
        applyAlpha(i);
        if (alpha[i] === target[i]) refreshAnnot();
      }
    }
    elev.car.visible = elev.state.carY <= floorY(upTo) + data.wallHeight + 1;

    // doors
    for (const d of doors) {
      if (d.amt !== d.target) {
        d.amt += Math.sign(d.target - d.amt) * Math.min(Math.abs(d.target - d.amt), dt / 0.55);
        placeDoor(d); setSign(d);
        if (d.amt === d.target) for (const w of d.waiters.splice(0)) w();
      }
    }
    elev.update(dt);
    surfaces.tick(dt, simT);
    fxsys.update(realDt);
    lighting.update(realDt, performance.now() / 1000);
    pollInUse(realDt);
    if (muralWait && clock.t >= muralWait.until) { muralWait.res(); muralWait = null; }

    // plants
    for (const p of anim.plants) {
      if (reduceMotion) break;
      p.g.rotation.z = Math.sin(simT * 0.9 + p.phase) * p.amp;
      p.g.rotation.x = Math.cos(simT * 0.7 + p.phase * 1.3) * p.amp * 0.7;
    }
    // clocks (real Denver time)
    const now = performance.now();
    if (now - dn.at > 1000) { dn.snap = clock.denver(); dn.at = now; }
    const secs = dn.snap.s + (now - dn.at) / 1000;
    const mins = dn.snap.m + secs / 60, hrs = (dn.snap.h % 12) + mins / 60;
    for (const c of anim.clocks) {
      c.hour.rotation.z = -(hrs / 12) * Math.PI * 2;
      c.min.rotation.z = -(mins / 60) * Math.PI * 2;
      c.sec.rotation.z = -(secs / 60) * Math.PI * 2;
    }
    // code screens: scroll + flicker (visible floors only)
    for (let k = 0; k < tex.code.length; k++) tex.code[k].offset.y = (tex.code[k].offset.y + dt * (0.04 + k * 0.025)) % 1;
    flickT -= dt;
    if (flickT <= 0) {
      flickT = 0.22;
      for (const s of anim.screens.values()) {
        if (s.mode !== 'working') continue;
        if (Math.random() < 0.35) { s.variant = (s.variant + 1 + Math.floor(Math.random() * 2)) % 3; s.mesh.material = floorMats[s.floorIdx].screen.code[s.variant]; }
      }
    }
    // rack LEDs
    rackT -= realDt;
    if (rackT <= 0) {
      rackT = 0.14;
      const g = tex.rackCtx;
      g.fillStyle = '#1b1f25'; g.fillRect(0, 0, 128, 256);
      for (let r = 0; r < 8; r++) {
        const y = 10 + r * 30;
        g.fillStyle = '#2c323b'; g.fillRect(8, y, 112, 24);
        g.fillStyle = '#11141a'; for (let k = 0; k < 4; k++) g.fillRect(14 + k * 16, y + 14, 12, 6);
        for (let k = 0; k < 3; k++) {
          const on = Math.random() < 0.55;
          g.fillStyle = on ? (Math.random() < 0.06 ? '#ffb347' : '#5be37d') : '#26452f';
          g.fillRect(84 + k * 11, y + 6, 6, 6);
        }
        g.fillStyle = Math.random() < 0.5 ? '#6db7ff' : '#1f3550'; g.fillRect(84, y + 16, 6, 4);
      }
      tex.rack.needsUpdate = true;
    }
    // cooler bubbles
    for (const b of anim.bubbles) {
      for (let i = 0; i < b.n; i++) {
        const k = ((simT * 0.5 + b.phase[i]) % 1);
        v3.set(Math.sin(simT * 2 + i * 2.1) * 0.08 + (i - 2.5) * 0.04, 1.2 + k * 0.5, Math.cos(simT * 1.7 + i) * 0.08);
        const s = k > 0.9 ? (1 - k) * 10 : 1;
        sc.setScalar(s);
        m4.compose(v3, q0, sc);
        b.mesh.setMatrixAt(i, m4);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
    // steam
    steamT -= dt;
    if (steamT <= 0 && dt > 0) {
      steamT = 0.3;
      for (const s of steamPts) if (s.floor <= upTo) fxsys.spawn('steam', s.x, floorY(s.floor) + s.y + 0.9, s.z);
    }
    // desk-view: keep floor visibility following the agent
    viewTimer += realDt;
    if (viewTimer > 0.5) {
      viewTimer = 0;
      const v = ctx.cam?.getView?.();
      if (v?.type === 'desk') { const f = ctx.agents?.getFloor?.(v.agent); if (Number.isInteger(f) && f !== upTo) setFloorVisibility(f); }
    }
  });

  void shade; void simAcc;
  return world;
}
