// STUB world (S1 replaces this whole folder's contents, keeping the exported contract).
import { applySurfaceOp } from '../core/surfaceops.js';
import { OUTLINE } from '../core/util.js';

const TYPE_COLOR = { desk: '#e8d3ad', sofa: '#c9a7c4', table: '#e8d3ad', rug: '#d9cdf3', plant: '#6fae6b', rack: '#555', coffeebar: '#b08a63', reception: '#d8c3a0', window: '#bfe3ff', clock: '#fff', chair: '#8a7a66', cooler: '#9ad0e8', foosball: '#c0655b', bookshelf: '#a98963', coffeetable: '#d6c19a', coffeemachine: '#444', entrance: '#9ad0e8' };
const SURF_COLOR = { whiteboard: '#ffffff', voteboard: '#fff6d6', jira: '#f0f4fb', ciwall: '#25303c', xray: '#1f2b36', slack: '#3b2b4a', mural: '#fbfaf5', confscreen: '#25303c', corkboard: '#c8a574', jira2: '#fff' };

export function createWorld(ctx) {
  const { THREE, scene } = ctx.scene;
  const data = ctx.data.world;
  const bus = ctx.bus;
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const floorGroups = data.floors.map((f) => {
    const g = new THREE.Group();
    g.name = `floor-${f.id}`;
    g.position.y = f.index * data.floorPitch;
    group.add(g);
    return g;
  });
  const lineMat = new THREE.LineBasicMaterial({ color: OUTLINE });
  const box = (g, w, h, d, color, x, y, z, rotY = 0, opts = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    g.add(m);
    if (!opts.noEdges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e); }
    return m;
  };

  // slabs + walls + (placeholder) furniture + surfaces
  data.floors.forEach((f, i) => {
    const g = floorGroups[i];
    box(g, data.floorSize.w, data.slabThickness, data.floorSize.d, '#fbf6ea', 0, -data.slabThickness / 2, 0);
    box(g, data.floorSize.w + 0.4, 0.3, data.floorSize.d + 0.4, f.accent, 0, -data.slabThickness - 0.15, 0, 0, { noEdges: true });
  });
  for (const w of data.walls) {
    const g = floorGroups[w.floor];
    const acc = data.floors[w.floor].accent;
    const segs = [];
    const horiz = w.z1 === w.z2;
    const a = horiz ? w.x1 : w.z1, b = horiz ? w.x2 : w.z2;
    let cur = a;
    for (const gap of [...(w.gaps || [])].sort((p, q) => p.from - q.from)) { segs.push([cur, gap.from]); cur = gap.to; }
    segs.push([cur, b]);
    for (const [s, e] of segs) {
      if (e - s < 0.01) continue;
      const len = e - s, mid = (s + e) / 2;
      const glass = w.kind === 'glass';
      const col = glass ? '#cfe9f2' : acc;
      if (horiz) box(g, len, w.h, w.thick, col, mid, w.h / 2, w.z1, 0, glass ? { opacity: 0.28 } : {});
      else box(g, w.thick, w.h, len, col, w.x1, w.h / 2, mid, 0, glass ? { opacity: 0.28 } : {});
    }
  }
  for (const it of data.furniture) {
    const g = floorGroups[it.floor];
    const col = it.color || TYPE_COLOR[it.type] || '#ddd';
    const y = (it.y || 0) + it.h / 2;
    if (it.shape === 'round') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(it.r, it.r, it.h, 24), new THREE.MeshLambertMaterial({ color: col }));
      m.position.set(it.x, y, it.z); g.add(m);
    } else {
      box(g, it.w, it.h, it.d, col, it.x, y, it.z, it.rot, it.type === 'rug' ? { noEdges: true } : {});
    }
  }
  for (const s of data.surfaces) {
    const g = floorGroups[s.floor];
    const m = box(g, s.w, s.h, 0.12, SURF_COLOR[s.kind] || '#fff', 0, 0, 0, 0);
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.rot;
    m.userData.pick = { type: 'surface', id: s.id, kind: s.kind, floor: s.floor };
  }

  /* ---------- API ---------- */
  const slotMap = new Map(data.slots.map((s) => [s.id, s]));
  const surfDef = new Map(data.surfaces.map((s) => [s.id, s]));
  const surfState = new Map(data.surfaces.map((s) => [s.id, {}]));
  const roomMap = new Map(data.rooms.map((r) => [r.id, r]));
  const floorY = (i) => i * data.floorPitch;
  const toWorld = (floor, x, z, y = 0) => new THREE.Vector3(x, floorY(floor) + y, z);
  const withWorld = (s) => (s ? { ...s, wx: s.x, wy: floorY(s.floor), wz: s.z } : null);
  const elevatorCar = { floor: 0, y: 0 };

  const world = {
    data, group, THREE,
    floorGroup: (i) => floorGroups[i],
    floorY, toWorld,
    slot: (id) => withWorld(slotMap.get(id)),
    slots: (prefix) => data.slots.filter((s) => !prefix || s.id.startsWith(prefix)).map(withWorld),
    room: (id) => roomMap.get(id) || null,
    rooms: (floor) => data.rooms.filter((r) => floor == null || r.floor === floor),
    surface: (id) => { const d = surfDef.get(id); return d ? { ...d, state: surfState.get(id) } : null; },
    surfaces: {
      list: (floor) => data.surfaces.filter((s) => floor == null || s.floor === floor).map((s) => s.id),
      get: (id) => surfState.get(id) ?? null,
      update(id, op, payload) {
        if (!surfDef.has(id)) { console.warn('[world] unknown surface', id); return null; }
        const next = applySurfaceOp(surfState.get(id), op, payload);
        surfState.set(id, next);
        bus.emit('surface:update', { id, kind: surfDef.get(id).kind, op, data: payload, state: next });
        return next;
      },
    },
    setDoor(id, open) { bus.emit('door:state', { id, open }); return Promise.resolve(); },
    elevator: {
      acquire: () => Promise.resolve(() => {}),
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
      moveTo: (floor) => { elevatorCar.floor = floor; elevatorCar.y = floorY(floor); return Promise.resolve(); },
      carPos: () => new THREE.Vector3(data.elevator.x, elevatorCar.y, data.elevator.z + 0.6),
      doorPos: (floor) => toWorld(floor, data.elevator.x, data.elevator.doorZ + 0.8),
    },
    stairs: {
      // world-space waypoints between the two floors' stairs entry points (flat stub: straight line)
      path(from, to) {
        const e = data.stairs.entry;
        return [toWorld(from, e.x, e.z), toWorld(from, data.stairs.bottomLanding.x, data.stairs.bottomLanding.z), toWorld(to, data.stairs.topLanding.x, data.stairs.topLanding.z), toWorld(to, e.x, e.z)];
      },
    },
    fx() {},
    pickables: () => [group],
    reset() { for (const id of surfState.keys()) surfState.set(id, {}); },
  };
  return world;
}
