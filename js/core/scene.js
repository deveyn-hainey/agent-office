// Core renderer + isometric camera rig + render loop. Owned by S0.
// createScene(container, { bus, clock, world }) -> scene API (see docs/ARCHITECTURE.md §4).
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { CREAM, clamp, easeInOut, parseView } from './util.js';

const ELEV = Math.atan(1 / Math.SQRT2); // true isometric elevation (35.264°)
const AZIM = Math.PI / 4;
const DIR = new THREE.Vector3(Math.cos(ELEV) * Math.sin(AZIM), Math.sin(ELEV), Math.cos(ELEV) * Math.cos(AZIM)); // camera sits at +x,+z,+y

export function createScene(container, { bus, clock, world }) {
  const pitch = world.floorPitch;
  const wallH = world.wallHeight;
  const nFloors = world.floors.length;
  const floorY = (i) => i * pitch;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color(CREAM), 1);
  renderer.domElement.className = 'gl';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(CREAM);
  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
  sun.position.set(30, 60, 24);
  scene.add(ambient, sun);

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
    const h = hint.allView || { fitW: 54, fitH: 108 };
    return { target: new THREE.Vector3(0, (floorY(nFloors - 1) + floorY(0)) / 2 + wallH * 0.45, 0), viewH: fit(h.fitW, h.fitH) };
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
    userActive: (sec = 15) => performance.now() - rig.lastUser < sec * 1000,
    get viewH() { return rig.viewH; },
    get target() { return rig.target; },
  };

  /* ---------- input: wheel zoom, drag pan, click/hover events ---------- */
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0012);
    const oldH = rig.viewH, newH = clamp(oldH / f, 9, 150);
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const aspect = size.w / size.h;
    if (rig.view.type !== 'desk') {
      rig.target.addScaledVector(camRight, nx * (oldH - newH) * aspect / 2).addScaledVector(camUp, ny * (oldH - newH) / 2);
    }
    rig.viewH = newH;
    rig.tween = null;
    rig.lastUser = performance.now();
    bus?.emit('cam:zoom', { viewH: rig.viewH });
  }, { passive: false });

  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
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
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    frames++;
  }

  const api = {
    THREE, scene, renderer, labelRenderer, camera, lights: { ambient, sun }, cam,
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
