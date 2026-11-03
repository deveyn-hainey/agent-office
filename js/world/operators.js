// Human operators: the people who prompt the bots, seated in the 4F Operator Room.
// Deliberately NOT bot-like: matte light-grey / charcoal capsule body, round head with a headset, shoulders + arms, no face.
// Local and read-only: reacts to bus events (operator:prompt, ask:answer, you-messages) and never sends anything anywhere.
//   world.operators.prompt({ text, target?: agentId, who?: 'Operator'|'PM'|'Reviewer (human)' })  -> operator types, bubble, prompt line
//   world.operators.say(text, who?)                                                             -> short bubble ("Approved ✓")
import { truncate, clamp } from '../core/util.js';

const BERRY = '#870b64';
const LOOKS = [
  { torso: '#cdd1d8', legs: '#3b3e46', band: '#2b2e35', cup: BERRY },
  { torso: '#41454e', legs: '#c9cdd4', band: '#c9cdd4', cup: '#2b2e35' },
  { torso: '#dcdfe4', legs: '#555963', band: '#2b2e35', cup: '#8a8f99' },
];
const HEAD = '#e9ebef';
const TYPE_MS = 4600;      // operator keeps typing this long after a prompt (real time)
const BUBBLE_MS = 5600;

export function createOperators({ ctx, T, floorGroups, group, floorY, setDeskScreen }) {
  const { bus, clock } = ctx;
  const data = ctx.data.world;
  const slots = data.slots.filter((s) => s.kind === 'operator').sort((a, b) => a.id.localeCompare(b.id));
  const plateOf = (s) => data.furniture.find((f) => f.id === `${s.id}-furn`)?.plate?.name || 'Operator';
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mats = {};
  const mat = (c) => (mats[c] ||= new T.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0 }));
  const cap = (r, len, m, parent, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(new T.CapsuleGeometry(r, len, 6, 14), m);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.userData.noPick = true; parent.add(mesh); return mesh;
  };

  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (glowTex = new T.CanvasTexture(c));
  }
  function paintConsole(op) {
    const g = op.cv.getContext('2d'), W = 360, H = 228, on = op.typing > 0.5;
    g.fillStyle = on ? '#ffffff' : '#2b2e36'; g.fillRect(0, 0, W, H);
    if (on) {
      g.fillStyle = BERRY; g.fillRect(0, 0, W, 34);
      g.fillStyle = '#fff'; g.font = '700 20px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('New prompt', 14, 18);
      g.fillStyle = '#16171b'; g.font = '600 22px Inter, system-ui, sans-serif';
      const shown = op.text.slice(0, Math.floor(op.typed));
      const words = shown.split(' '); let ln = '', y = 64;
      for (const w of words) { const t = ln ? ln + ' ' + w : w; if (g.measureText(t).width > W - 30 && ln) { g.fillText(ln, 14, y); ln = w; y += 30; } else ln = t; }
      if (Math.floor(op.typed * 2) % 2 === 0 || op.typed < op.text.length) ln += '▌';
      g.fillText(ln, 14, y);
    } else {
      g.fillStyle = '#4a4e59';
      for (let i = 0; i < 4; i++) g.fillRect(16, 48 + i * 36, 120 + ((i * 97) % 160), 10);
    }
    op.ctex.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- figure */
  function build(slot, k) {
    const look = LOOKS[k % LOOKS.length];
    const root = new T.Group();
    root.position.set(slot.x, 0, slot.z); root.rotation.y = slot.facing; root.scale.setScalar(1.15);
    root.name = `operator-${slot.id}`;
    floorGroups[slot.floor].add(root);
    const torsoM = mat(look.torso), legM = mat(look.legs), headM = mat(HEAD);
    const body = new T.Group(); root.add(body);
    cap(0.27, 0.3, torsoM, body, 0, 1.05, -0.02);                                   // torso
    const sh = cap(0.15, 0.46, torsoM, body, 0, 1.36, -0.02); sh.rotation.z = Math.PI / 2;   // shoulders
    const neck = new T.Mesh(new T.CylinderGeometry(0.09, 0.1, 0.14, 12), headM); neck.position.set(0, 1.55, 0); body.add(neck);
    const head = new T.Group(); head.position.set(0, 1.74, 0.03); body.add(head);
    const skull = new T.Mesh(new T.SphereGeometry(0.24, 24, 18), headM); skull.castShadow = true; head.add(skull);
    // headset: band over the head, two ear cups, a mic boom
    const band = new T.Mesh(new T.TorusGeometry(0.26, 0.032, 8, 28, Math.PI), mat(look.band)); head.add(band);
    for (const sx of [-1, 1]) {
      const cup = new T.Mesh(new T.CylinderGeometry(0.095, 0.095, 0.08, 14), mat(look.cup));
      cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.255, -0.01, 0); head.add(cup);
    }
    const boom = new T.Mesh(new T.CapsuleGeometry(0.016, 0.26, 3, 6), mat(look.band)); boom.rotation.x = Math.PI / 2.6; boom.position.set(-0.22, -0.1, 0.15); head.add(boom);
    const tip = new T.Mesh(new T.SphereGeometry(0.04, 8, 8), mat(look.band)); tip.position.set(-0.18, -0.17, 0.27); head.add(tip);
    // arms (pivot at the shoulder; typing wiggles the pivots)
    const arms = [-1, 1].map((sx) => {
      const piv = new T.Group(); piv.position.set(sx * 0.4, 1.34, 0.0); piv.rotation.x = -1.2; body.add(piv);
      cap(0.085, 0.58, torsoM, piv, 0, -0.38, 0);
      const hand = new T.Mesh(new T.SphereGeometry(0.095, 10, 8), headM); hand.position.set(0, -0.76, 0); piv.add(hand);
      return piv;
    });
    // legs: thighs along the seat, shins down
    for (const sx of [-1, 1]) {
      const th = cap(0.13, 0.3, legM, root, sx * 0.17, 0.68, 0.26); th.rotation.x = Math.PI / 2;
      cap(0.11, 0.3, legM, root, sx * 0.17, 0.34, 0.58);
      const foot = new T.Mesh(new T.BoxGeometry(0.2, 0.09, 0.34), mat('#25272d')); foot.position.set(sx * 0.17, 0.06, 0.66); root.add(foot);
    }
    // lit prompt console lying on the desk (dim when idle, bright chat window while the operator is typing)
    const df = data.furniture.find((f) => f.id === `${slot.id}-furn`);
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 228;
    const ctex = new T.CanvasTexture(cv); ctex.colorSpace = T.SRGBColorSpace;
    const cons = new T.Group(); cons.position.set(df.x, df.h + 0.07, df.z - 0.12);
    const bezel = new T.Mesh(new T.BoxGeometry(1.62, 0.04, 1.06), mat('#22242a')); bezel.userData.noPick = true;
    const scr = new T.Mesh(new T.PlaneGeometry(1.5, 0.95), new T.MeshBasicMaterial({ map: ctex })); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.025; scr.userData.noPick = true;
    cons.add(bezel, scr); cons.rotation.x = 0.1; floorGroups[slot.floor].add(cons);
    const glow = new T.Mesh(new T.PlaneGeometry(3.4, 2.6), new T.MeshBasicMaterial({ map: glowTexture(), color: '#bfe0ff', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(df.x, df.h + 0.05, df.z); glow.userData.noPick = true; glow.renderOrder = 3; floorGroups[slot.floor].add(glow);
    const label = document.createElement('div');
    label.className = 'op-bubble';
    const lab = ctx.scene.css2d(label); lab.visible = false;
    lab.position.set(0, 2.55, 0); root.add(lab);
    return { root, body, head, arms, cv, ctex, glow, text: '', typed: 0, label, lab, slot, name: plateOf(slot), seed: k * 1.7, typing: 0, until: 0, bubbleUntil: 0, active: false, screenMode: 'idle' };
  }
  const ops = slots.map(build);
  const byName = (who) => ops.find((o) => o.name.toLowerCase() === String(who || '').toLowerCase()) || ops[0];

  /* ---------------------------------------------------------------- prompt line (dotted arc + paper-plane packet) */
  const N = 40;
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill();
    return new T.CanvasTexture(c);
  })();
  const pos = new Float32Array(N * 3);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const dotMat = new T.PointsMaterial({ color: BERRY, size: 6, sizeAttenuation: false, map: dotTex, transparent: true, alphaTest: 0.2, depthTest: false, depthWrite: false });
  const dots = new T.Points(geo, dotMat);
  dots.frustumCulled = false; dots.renderOrder = 999; dots.userData.noPick = true; dots.visible = false;
  const packet = new T.Group(); packet.visible = false; packet.userData.noPick = true;
  const plane = new T.Mesh(new T.ConeGeometry(0.2, 0.7, 3), new T.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }));
  plane.rotation.x = Math.PI / 2; plane.scale.set(1, 1, 0.35); plane.renderOrder = 1001;
  const rim = new T.Mesh(new T.ConeGeometry(0.26, 0.8, 3), new T.MeshBasicMaterial({ color: BERRY, depthTest: false, depthWrite: false }));
  rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1, 0.35); rim.renderOrder = 1000;
  packet.add(rim, plane);
  group.add(dots, packet);

  const A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3(), P = new T.Vector3(), Q = new T.Vector3();
  let line = null;   // { op, from:Vector3, targetFn, t, phase }

  function targetPoint(target, out) {
    if (target && ctx.agents?.getWorldPosition) {
      const p = ctx.agents.getWorldPosition(target);
      const v = ctx.agents.get?.(target);
      if (p && v?.visible !== false) return out.set(p.x, p.y + 1.1, p.z);
    }
    const s = data.surfaces.find((x) => x.id === 'board-4f');   // no target: the 4F request whiteboard
    return out.set(s.x + 0.4, floorY(s.floor) + s.y, s.z + 0.5);
  }
  const bez = (t, out) => {
    const u = 1 - t;
    return out.set(u * u * A.x + 2 * u * t * C.x + t * t * B.x, u * u * A.y + 2 * u * t * C.y + t * t * B.y, u * u * A.z + 2 * u * t * C.z + t * t * B.z);
  };
  function startLine(op, target) {
    group.updateMatrixWorld?.();
    line = { op, target, t: 0, wait: 0.7, travel: 1.5, hold: 1.1 };
    dots.visible = false; packet.visible = false;
  }
  function updateLine(realDt) {
    if (!line) return;
    const op = line.op;
    if (!floorGroups[op.slot.floor].visible) { dots.visible = false; packet.visible = false; if ((line.t += realDt) > 6) line = null; return; }
    line.t += realDt;
    const tt = line.t - line.wait;
    if (tt < 0) return;
    A.set(op.slot.x, floorY(op.slot.floor) + 2.45, op.slot.z - 0.2);
    targetPoint(line.target, B);
    C.set((A.x + B.x) / 2, Math.max(A.y, B.y) + 1.5 + A.distanceTo(B) * 0.28, (A.z + B.z) / 2);
    const p = clamp(tt / line.travel, 0, 1);
    const fade = tt > line.travel ? clamp(1 - (tt - line.travel) / line.hold, 0, 1) : 1;
    for (let i = 0; i < N; i++) { const k = i / (N - 1); bez(k, P); pos[i * 3] = P.x; pos[i * 3 + 1] = P.y; pos[i * 3 + 2] = P.z; }
    geo.attributes.position.needsUpdate = true;
    geo.setDrawRange(0, Math.max(1, Math.round(p * N)));
    dots.visible = true; dotMat.opacity = fade;
    if (p < 1) {
      bez(p, P); bez(Math.min(1, p + 0.03), Q);
      packet.position.copy(P); packet.lookAt(Q.x, Q.y, Q.z); packet.visible = true;
      packet.rotation.z += Math.sin(line.t * 10) * 0.2;
    } else {
      if (!line.landed) { line.landed = true; const v = ctx.agents?.get?.(line.target); if (v?.floor != null) ctx.world?.fx?.('sparkle', v.floor, B.x, B.z); }
      packet.visible = false;
    }
    if (tt > line.travel + line.hold) { line = null; dots.visible = false; packet.visible = false; }
  }

  /* ---------------------------------------------------------------- bubble + activity */
  function bubble(op, text, role = op.name) {
    op.label.innerHTML = '';
    const r = document.createElement('div'); r.className = 'op-role'; r.textContent = role;
    const t = document.createElement('div'); t.className = 'op-text'; t.textContent = text;
    op.label.append(r, t);
    op.lab.visible = true;
    op.bubbleUntil = BUBBLE_MS / 1000;
    op.text = text; op.typed = 0;
  }
  function activate(op, ms = TYPE_MS) {
    op.active = true; op.until = ms / 1000;
    if (op.screenMode !== 'working') { op.screenMode = 'working'; setDeskScreen?.(op.slot.id, 'working'); }
  }
  function endActive(op) {
    op.active = false;
    if (op.screenMode !== 'idle') { op.screenMode = 'idle'; setDeskScreen?.(op.slot.id, 'idle'); }
  }

  const api = {
    list: () => ops.map((o) => ({ id: o.slot.id, name: o.name, floor: o.slot.floor, active: o.active })),
    /** an operator types the prompt, a pill shows it and a dotted line + packet travels to the target bot (or the 4F whiteboard) */
    prompt({ text, target = null, who = 'Operator' } = {}) {
      const op = byName(who);
      if (!op || clock.seeking) return false;
      bubble(op, truncate(String(text || ''), 56));
      activate(op);
      startLine(op, target);
      return true;
    },
    /** a short human reaction bubble, e.g. "Approved ✓" */
    say(text, who = 'Reviewer (human)') {
      const op = byName(who);
      if (!op || clock.seeking) return false;
      bubble(op, truncate(String(text || ''), 40));
      activate(op, 1800);
      return true;
    },
  };

  let cmdAt = -1e9;
  bus.on('command:submitted', () => { cmdAt = performance.now(); });
  bus.on('operator:prompt', (e) => api.prompt(e || {}));
  bus.on('ask:answer', ({ choice }) => {
    const ok = /approv|yes|ship|ok|go/i.test(choice || '');
    api.say(ok ? 'Approved ✓' : /skip|no|reject/i.test(choice || '') ? 'Skipped ✗' : String(choice || ''), 'Reviewer (human)');
  });
  // a scripted "You" message in a scenario (not typed in the command box) is the PM posting the request
  bus.on('slack:message', (m) => {
    if (!m?.you || performance.now() - cmdAt < 400) return;
    api.prompt({ text: m.text, who: 'PM' });
  });
  bus.on('replay:reset', () => { line = null; dots.visible = false; packet.visible = false; for (const o of ops) { o.lab.visible = false; o.bubbleUntil = 0; endActive(o); } });

  /* ---------------------------------------------------------------- per-frame */
  function update(dt, simT, realDt) {
    for (const op of ops) {
      if (op.until > 0) { op.until -= realDt; if (op.until <= 0) endActive(op); }
      if (op.bubbleUntil > 0) { op.bubbleUntil -= realDt; if (op.bubbleUntil <= 0) op.lab.visible = false; }
      op.typing += ((op.active ? 1 : 0) - op.typing) * Math.min(1, realDt * 8);
      op.glow.material.opacity = 0.55 * op.typing;
      if (op.active && op.typed < op.text.length) op.typed = Math.min(op.text.length, op.typed + realDt * 26);
      op.paintT = (op.paintT || 0) - realDt;
      if (op.paintT <= 0 && (op.active || op.dirty !== false)) { op.paintT = 0.12; paintConsole(op); op.dirty = op.active; }
      if (reduceMotion) continue;
      const t = simT + op.seed * 10, k = op.typing;
      // idle: slow occasional keystrokes; active: fast alternating hands + a small nod
      const burst = Math.max(0, Math.sin(t * 0.7 + op.seed)) ** 2;
      const amp = 0.03 + 0.05 * burst + 0.07 * k, f = 7 + 14 * k;
      op.arms[0].rotation.x = -1.2 + Math.sin(t * f) * amp;
      op.arms[1].rotation.x = -1.2 + Math.sin(t * f + 2.1) * amp;
      op.arms[0].rotation.z = Math.sin(t * f * 0.5) * 0.05 * k;
      op.arms[1].rotation.z = -Math.sin(t * f * 0.5 + 1) * 0.05 * k;
      op.head.rotation.x = 0.06 + Math.sin(t * (2 + 2 * k)) * (0.02 + 0.04 * k);
      op.head.rotation.y = Math.sin(t * 0.35 + op.seed) * 0.12 * (1 - k);
      op.body.position.y = Math.sin(t * 1.4) * 0.008;
    }
    updateLine(realDt);
  }
  ctx.scene.addUpdate((dt, simT, realDt) => update(dt, simT, realDt));
  return api;
}
