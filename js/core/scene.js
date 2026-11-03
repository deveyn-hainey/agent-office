// Core renderer + isometric camera rig + render loop. Owned by S0.
// createScene(container, { bus, clock, world }) -> scene API (see docs/ARCHITECTURE.md §4).
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { clamp, easeInOut, parseView } from './util.js';

const ELEV = Math.atan(1 / Math.SQRT2); // true isometric elevation (35.264°)
const AZIM = Math.PI / 4;
const BASE_H = 12; // white facade base under the lobby (world/building.js)
const DIR = new THREE.Vector3(Math.cos(ELEV) * Math.sin(AZIM), Math.sin(ELEV), Math.cos(ELEV) * Math.cos(AZIM)); // camera sits at +x,+z,+y

export function createScene(container, { bus, clock, world }) {
  const pitch = world.floorPitch;
  const wallH = world.wallHeight;
  const nFloors = world.floors.length;
  const floorY = (i) => i * pitch;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color('#ffffff'), 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'gl';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 60, 24);
  // soft shadows: the shadow frustum follows the camera (see updateSunShadow); world/lighting.js sets lights.sunOffset
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  const sunOffset = new THREE.Vector3(-26, 60, 34);
  scene.add(ambient, sun, sun.target);

  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 800);

  /* ---------- camera rig ---------- */
  const rig = {
    target: new THREE.Vector3(0, 40, 0),
    viewH: 110,
    view: { type: 'all' },
    clean: false,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
    tween: null,
    locator: null,
    lastUser: -1e9,
  };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const size = { w: 1, h: 1 };

  const camRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), DIR).normalize(); // screen-right in world
  const camUp = new THREE.Vector3().crossVectors(DIR, camRight).normalize();

  // viewH (world units visible vertically) so that a cw x ch (world units, screen-space) box fits the free area
  function fit(cw, ch) {
    const aw = Math.max(200, size.w - rig.insets.left - rig.insets.right);
    const ah = Math.max(200, size.h - rig.insets.top - rig.insets.bottom);
    const scale = Math.min(aw / cw, ah / ch); // px per world unit
    return size.h / scale;
  }

  function goalFor(view) {
    const hint = world.cameraHint || {};
    if (view.type === 'floor') {
      const h = hint.floorView || { fitW: 54, fitH: 42 };
      return { target: new THREE.Vector3(0, floorY(view.floor) + wallH * 0.45, 0), viewH: fit(h.fitW, h.fitH) };
    }
    if (view.type === 'desk') {
      const p = rig.locator?.(view.agent);
      const t = p ? new THREE.Vector3(p.x, p.y + 1.0, p.z) : rig.target.clone();
      return { target: t, viewH: fit(11, 8) };
    }
    if (view.type === 'spot') {
      // close-up on a point (board focus / double-click zoom): explicit viewH, or fit a w x h box
      const t = new THREE.Vector3(+view.x || 0, +view.y || 0, +view.z || 0);
      return { target: t, viewH: clamp(view.viewH ?? fit((view.w || 10) * 1.2, (view.h || 5) * 1.9), 6, 150) };
    }
    const h = hint.allView || { fitW: 54, fitH: 108 };
    return { target: new THREE.Vector3(0, (floorY(nFloors - 1) + floorY(0)) / 2 + wallH * 0.45 - BASE_H / 2, 0), viewH: fit(h.fitW, h.fitH + BASE_H * 0.9) };
  }

  function applyCamera() {
    const aspect = size.w / size.h;
    const hh = rig.viewH / 2, hw = hh * aspect;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    camera.position.copy(rig.target).addScaledVector(DIR, 300);
    camera.lookAt(rig.target);
    const dx = (rig.insets.left - rig.insets.right) / 2, dy = (rig.insets.top - rig.insets.bottom) / 2;
    if (dx || dy) camera.setViewOffset(size.w, size.h, -dx, -dy, size.w, size.h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  function setView(v, opts = {}) {
    const view = parseView(v);
    const prev = rig.view;
    rig.view = view;
    const dur = reduceMotion || opts.animate === false ? 0 : opts.duration ?? 0.9;
    if (dur <= 0) {
      const g = goalFor(view);
      rig.target.copy(g.target); rig.viewH = g.viewH; rig.tween = null;
    } else {
      rig.tween = { t: 0, dur, fromT: rig.target.clone(), fromH: rig.viewH };
    }
    bus?.emit('cam:view', { view, prev });
  }

  function stepCamera(dt) {
    const g = goalFor(rig.view);
    if (rig.tween) {
      const tw = rig.tween;
      tw.t += dt;
      const k = easeInOut(clamp(tw.t / tw.dur, 0, 1));
      rig.target.lerpVectors(tw.fromT, g.target, k);
      rig.viewH = tw.fromH + (g.viewH - tw.fromH) * k;
      if (tw.t >= tw.dur) { rig.tween = null; bus?.emit('cam:settled', { view: rig.view }); }
    } else if (rig.view.type === 'desk') {
      rig.target.lerp(g.target, 1 - Math.exp(-dt * 6)); // follow the agent
    }
  }

  const cam = {
    setView,
    getView: () => ({ ...rig.view }),
    nextFloor(d = 1) {
      const cur = rig.view.type === 'floor' ? rig.view.floor : d > 0 ? -1 : nFloors;
      setView({ type: 'floor', floor: clamp(cur + d, 0, nFloors - 1) });
    },
    setClean(on) {
      rig.clean = !!on;
      document.body.classList.toggle('clean', rig.clean);
      bus?.emit('cam:clean', { on: rig.clean });
    },
    isClean: () => rig.clean,
    zoomBy(f) {
      rig.viewH = clamp(rig.viewH / f, 9, 150);
      rig.lastUser = performance.now();
      bus?.emit('cam:zoom', { viewH: rig.viewH });
    },
    panBy(dxPx, dyPx) {
      const k = rig.viewH / size.h; // world units per px
      rig.target.addScaledVector(camRight, -dxPx * k).addScaledVector(camUp, dyPx * k);
      rig.lastUser = performance.now();
    },
    setInsets(i) { Object.assign(rig.insets, i); if (!rig.tween && rig.view.type !== 'desk') { const g = goalFor(rig.view); rig.viewH = g.viewH; } },
    getInsets: () => ({ ...rig.insets }),
    setLocator(fn) { rig.locator = fn; }, // fn(agentId) -> {x,y,z} world position | null
    markUser() { rig.lastUser = performance.now(); },
    userActive: (sec = 15) => performance.now() - rig.lastUser < sec * 1000,
    get viewH() { return rig.viewH; },
    get target() { return rig.target; },
  };

  /* ---------- input: wheel zoom, drag pan, click/hover events ---------- */
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  // zoom by factor f (>1 = in) keeping the world point under (clientX, clientY) fixed on screen.
  // animate=true tweens there through a 'spot' view instead of jumping (double-click, +/- buttons).
  function zoomAt(clientX, clientY, f, animate = false) {
    const oldH = rig.viewH, newH = clamp(oldH / f, 6, 150);
    const r = el.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width) * 2 - 1, ny = -(((clientY - r.top) / r.height) * 2 - 1);
    const aspect = size.w / size.h;
    const t = rig.target.clone();
    if (rig.view.type !== 'desk') t.addScaledVector(camRight, nx * (oldH - newH) * aspect / 2).addScaledVector(camUp, ny * (oldH - newH) / 2);
    rig.lastUser = performance.now();
    if (animate && rig.view.type !== 'desk') {
      const v = rig.view;
      const floor = v.type === 'floor' ? v.floor : v.type === 'spot' ? v.floor : undefined;
      setView({ type: 'spot', x: t.x, y: t.y, z: t.z, viewH: newH, floor, annot: v.type === 'floor' || !!v.annot }, { duration: 0.45 });
    } else {
      rig.target.copy(t);
      rig.viewH = newH;
      rig.tween = null;
    }
    bus?.emit('cam:zoom', { viewH: newH });
  }
  cam.zoomAt = zoomAt;
  cam.zoomBy = (f) => { const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f, true); };
  // fly to a world point; w/h = size of the thing to frame (world units)
  cam.focusPoint = (p, o = {}) => { rig.lastUser = performance.now(); setView({ type: 'spot', x: p.x, y: p.y, z: p.z, w: o.w, h: o.h, viewH: o.viewH, id: o.id, floor: o.floor }, { duration: o.duration ?? 1.0 }); };
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    // trackpad pinch arrives as ctrl+wheel with small deltas: scale it up a little
    const k = e.ctrlKey ? 0.01 : 0.0012;
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * k));
  }, { passive: false });
  el.addEventListener('dblclick', (e) => { bus?.emit('scene:dblclick', { clientX: e.clientX, clientY: e.clientY, event: e }); });
  // touch pinch (two pointers): zoom toward the midpoint
  const touches = new Map();
  let pinch = null;

  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
        drag = null; // a pinch is never a click or a pan
        return;
      }
    }
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (pinch && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
      return;
    }
    if (drag && drag.id === e.pointerId) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
      if (drag.moved && rig.view.type !== 'desk') {
        cam.panBy(e.clientX - drag.x, e.clientY - drag.y);
        rig.tween = null;
        el.classList.add('dragging');
      }
      drag.x = e.clientX; drag.y = e.clientY;
    } else {
      bus?.emit('scene:hover', { clientX: e.clientX, clientY: e.clientY });
    }
  });
  const endDrag = (e) => {
    if (touches.delete(e.pointerId) && touches.size < 2) pinch = null;
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && e.type === 'pointerup') bus?.emit('scene:click', { clientX: e.clientX, clientY: e.clientY, event: e });
    drag = null;
    el.classList.remove('dragging');
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  /* ---------- picking ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // Returns { pick:{type,id,...userData.pick}, hit:Intersection, point:{x,y,z} } for the nearest hit whose object
  // (or an ancestor) has userData.pick, else null. Objects marked userData.noPick are skipped.
  function pick(clientX, clientY, objects, recursive = true) {
    const r = el.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(objects, recursive);
    for (const h of hits) {
      let o = h.object, skip = false;
      for (let p = h.object; p; p = p.parent) if (p.userData?.noPick) skip = true;
      if (skip) continue;
      while (o && !o.userData?.pick) o = o.parent;
      if (o) return { pick: o.userData.pick, hit: h, point: { x: h.point.x, y: h.point.y, z: h.point.z } };
    }
    return null;
  }

  /* ---------- resize + loop ---------- */
  function resize() {
    const r = container.getBoundingClientRect();
    size.w = Math.max(1, Math.round(r.width)); size.h = Math.max(1, Math.round(r.height));
    renderer.setSize(size.w, size.h, false);
    renderer.domElement.style.width = size.w + 'px'; renderer.domElement.style.height = size.h + 'px';
    labelRenderer.setSize(size.w, size.h);
    if (!rig.tween && rig.view.type !== 'desk') rig.viewH = goalFor(rig.view).viewH;
    applyCamera();
  }
  new ResizeObserver(resize).observe(container);

  const sunDir = new THREE.Vector3();
  let shadowHalf = 0;
  function updateSunShadow() {
    const sc = sun.shadow.camera;
    const half = Math.ceil((rig.viewH * Math.max(1, size.w / size.h) * 0.6 + 14) / 8) * 8;
    sunDir.copy(sunOffset).normalize();
    const texel = (half * 2) / sun.shadow.mapSize.x;
    // snap the focus point to the shadow texel grid so shadows don't shimmer while panning
    const t = rig.target;
    sun.target.position.set(Math.round(t.x / texel) * texel, Math.round(t.y / texel) * texel, Math.round(t.z / texel) * texel);
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 160);
    sun.target.updateMatrixWorld();
    if (half !== shadowHalf) {
      shadowHalf = half;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 400;
      sc.updateProjectionMatrix();
    }
  }

  const updates = new Set();
  function addUpdate(fn) { updates.add(fn); return () => updates.delete(fn); }

  let last = performance.now(), frames = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    const simDt = clock.tick(realDt);
    stepCamera(realDt);
    applyCamera();
    for (const fn of [...updates]) {
      try { fn(simDt, clock.t, realDt); } catch (e) { console.error('[update]', e); updates.delete(fn); }
    }
    updateSunShadow();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    frames++;
  }

  const api = {
    THREE, scene, renderer, labelRenderer, camera, lights: { ambient, sun, sunOffset }, cam,
    domElement: renderer.domElement, container,
    floorY, addUpdate, pick, resize,
    css2d: (el) => new CSS2DObject(el), // wrap a DOM element as a label object; add it to any Object3D
    get frames() { return frames; },
    size,
  };
  resize();
  setView({ type: 'all' }, { animate: false });
  requestAnimationFrame(frame);
  return api;
}
