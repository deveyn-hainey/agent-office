// STUB agents (S2 replaces this folder's contents, keeping the exported contract).
// Spheres that teleport to slots. moveTo resolves immediately.
import { STATES, colorFor, OUTLINE } from '../core/util.js';

export function createAgents(ctx) {
  const { THREE, scene } = ctx.scene;
  const { bus, world, clock } = ctx;
  const group = new THREE.Group();
  group.name = 'agents';
  scene.add(group);

  const reserved = new Map(); // slotId -> agentId
  const list = new Map();

  for (const t of ctx.data.team.agents) {
    const color = colorFor(t);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshLambertMaterial({ color }));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(0.7, 8, 6)), new THREE.LineBasicMaterial({ color: OUTLINE })));
    mesh.userData.pick = { type: 'agent', id: t.id };
    const bub = document.createElement('div');
    bub.className = 'bubble';
    bub.hidden = true;
    const label = ctx.scene.css2d(bub);
    label.position.set(0, 1.6, 0);
    mesh.add(label);
    group.add(mesh);
    const a = { id: t.id, name: t.name, role: t.role, color, floor: 0, slotId: null, state: 'resting', task: '', visible: t.startVisible !== false, pose: 'stand', mesh, bubble: bub, bubbleUntil: 0, arrived: true, home: t.home };
    list.set(t.id, a);
    mesh.visible = a.visible;
  }

  function place(a, slotId) {
    const s = world.slot(slotId);
    if (!s) { console.warn('[agents] unknown slot', slotId); return false; }
    for (const [k, v] of reserved) if (v === a.id) reserved.delete(k);
    reserved.set(slotId, a.id);
    a.slotId = slotId; a.floor = s.floor;
    a.mesh.position.set(s.wx, s.wy + 0.7, s.wz);
    return true;
  }
  const api = {
    group,
    list: () => [...list.values()].map(view),
    get: (id) => (list.has(id) ? view(list.get(id)) : null),
    resolveSlot(spec, id) {
      if (!spec) return null;
      spec = String(spec).replace(/^slot:/, '');
      if (spec.startsWith('free:')) {
        const prefix = spec.slice(5);
        const s = world.slots(prefix).find((x) => !reserved.has(x.id) || reserved.get(x.id) === id);
        return s ? s.id : null;
      }
      return world.slot(spec) ? spec : null;
    },
    occupant: (slotId) => reserved.get(slotId) || null,
    moveTo(id, spec) {
      const a = list.get(id); const sid = api.resolveSlot(spec, id);
      if (!a || !sid) return Promise.resolve(false);
      a.mesh.visible = a.visible;
      place(a, sid);
      bus.emit('agent:arrive', { id, slot: sid, floor: a.floor });
      return Promise.resolve(true);
    },
    teleport(id, spec) { return api.moveTo(id, spec); },
    isArrived: () => true,
    stop() {},
    say(id, text, opts = {}) {
      const a = list.get(id); if (!a) return;
      const style = opts.style || 'speech';
      a.bubble.hidden = false; a.bubble.textContent = style === 'think' ? '...' : text;
      a.bubble.dataset.style = style;
      a.bubbleUntil = clock.t + (opts.ms ?? 3500) / 1000;
      bus.emit('agent:bubble', { id, text, style });
    },
    clearBubble(id) { const a = list.get(id); if (a) { a.bubble.hidden = true; a.bubbleUntil = 0; } },
    lookAt() {},
    setPose(id, pose) { const a = list.get(id); if (a) { a.pose = pose; bus.emit('agent:pose', { id, pose }); } },
    setStatus(id, state, task = '') {
      const a = list.get(id); if (!a || !STATES[state]) return;
      a.state = state; a.task = task;
      bus.emit('agent:status', { id, state, task });
    },
    setAlert(id, on) { const a = list.get(id); if (a) { if (on) api.say(id, '!', { style: 'alert', ms: 1e6 }); else api.clearBubble(id); } },
    ballot(id, choice) { bus.emit('agent:ballot', { id, choice }); },
    spawn(id, spec) { const a = list.get(id); if (!a) return Promise.resolve(false); a.visible = true; a.mesh.visible = true; return api.moveTo(id, spec || a.home); },
    despawn(id) { const a = list.get(id); if (a) { a.visible = false; a.mesh.visible = false; } },
    getWorldPosition(id) { const a = list.get(id); return a ? a.mesh.position.clone() : null; },
    getFloor: (id) => list.get(id)?.floor ?? 0,
    pickables: () => [group],
    reset() {
      reserved.clear();
      for (const a of list.values()) { a.visible = ctx.data.team.agents.find((t) => t.id === a.id)?.startVisible !== false; a.mesh.visible = a.visible; a.state = 'resting'; a.task = ''; api.clearBubble(a.id); place(a, a.home); }
    },
  };
  const view = (a) => ({ id: a.id, name: a.name, role: a.role, color: a.color, floor: a.floor, slotId: a.slotId, status: a.state, task: a.task, visible: a.visible, pose: a.pose, home: a.home });

  ctx.scene.addUpdate(() => {
    for (const a of list.values()) if (a.bubbleUntil && clock.t > a.bubbleUntil) api.clearBubble(a.id);
  });
  api.reset();
  return api;
}
