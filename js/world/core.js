// Elevator shaft/car/hall doors/indicator and zig-zag stairs. Same x/z on every floor.

const METAL = '#d9dde3', METAL_D = '#aeb4bd', FRAME = '#4a5560';
export const STAIR = { flights: 7, rise: 4, xA: 10.5, xB: 14.5, laneA: -9.6, laneB: -12.2 };

export function buildCore(env) {
  const { T, floor, data, group, b, mats, tex } = env;
  const el = data.elevator, st = data.stairs, H = data.wallHeight, P = data.floorPitch;
  const nF = data.floors.length;
  const x0 = el.x - el.w / 2, x1 = el.x + el.w / 2, z0 = el.z - el.d / 2, z1 = el.z + el.d / 2;
  const top = floor < nF - 1 ? P : H + 0.5;        // shaft height above this floor
  const glassB = env.glassBatch ?? (env.glassBatch = new env.Batch(T));
  const doorW = el.doorW, doorH = 3.3;

  /* ---------- shaft ---------- */
  // corner posts
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box(0.28, top, 0.28, FRAME, px, top / 2, pz);
  // glass on -x/+x faces, back face, and front face above hall level
  glassB.box(0.05, top - 0.3, el.d - 0.3, '#cfeaf4', x1, top / 2, el.z, 0, false);
  glassB.box(0.05, top - 0.3, el.d - 0.3, '#cfeaf4', x0, top / 2, el.z, 0, false);
  glassB.box(el.w - 0.3, top - 0.3, 0.05, '#cfeaf4', el.x, top / 2, z0, 0, false);
  if (floor < nF - 1) glassB.box(el.w - 0.3, P - H - 0.3, 0.05, '#cfeaf4', el.x, H + (P - H) / 2, z1, 0, false);
  // horizontal rails at every ~3.5 so the tall glass tube reads as a structure
  for (let y = 3.5; y < top - 0.2; y += 3.5) {
    b.box(0.12, 0.1, el.d, FRAME, x1, y, el.z, 0, false);
    b.box(el.w, 0.1, 0.12, FRAME, el.x, y, z1, 0, false);
  }
  if (floor === nF - 1) {   // roof cap with a little machine room
    b.box(el.w + 0.5, 0.3, el.d + 0.5, METAL, el.x, top + 0.0, el.z);
    b.box(2.2, 0.8, 2.0, METAL_D, el.x + 0.3, top + 0.7, el.z);
  }
  // front stiles + header around the hall doors (solid metal so the doors read clearly)
  const stile = (el.w - doorW) / 2;
  b.box(stile, H, 0.22, METAL, x0 + stile / 2, H / 2, z1);
  b.box(stile, H, 0.22, METAL, x1 - stile / 2, H / 2, z1);
  b.box(doorW + 0.02, H - doorH, 0.22, METAL, el.x, doorH + (H - doorH) / 2, z1);
  b.box(doorW + 0.5, 0.12, 0.3, FRAME, el.x, doorH + 0.06, z1 + 0.02);
  b.box(doorW + 0.4, 0.05, 0.4, '#2b2f36', el.x, 0.03, z1 + 0.05, 0, false);   // sill
  // call button panel
  b.box(0.22, 0.5, 0.06, '#2b2f36', x1 + 0.05 - 0.55 - stile + 0.6, 1.8, z1 + 0.14, 0, false);
  b.box(0.1, 0.1, 0.05, '#ffcf4a', x1 + 0.05 - 0.55 - stile + 0.6, 1.9, z1 + 0.18, 0, false);
  b.box(0.1, 0.1, 0.05, '#7ee0a0', x1 + 0.05 - 0.55 - stile + 0.6, 1.7, z1 + 0.18, 0, false);

  /* ---------- hall doors (2 sliding panels) ---------- */
  const halfW = doorW / 2;
  const hallDoors = [];
  for (const sgn of [-1, 1]) {
    const m = new T.Mesh(new T.BoxGeometry(halfW - 0.02, doorH, 0.1), mats.metal);
    m.position.set(el.x + sgn * halfW / 2, doorH / 2, z1 - 0.02);
    m.userData.noPick = true;
    const ln = new T.LineSegments(new T.EdgesGeometry(m.geometry), env.lineMat);
    m.add(ln);
    const win = new T.Mesh(new T.PlaneGeometry(0.34, 1.0), new T.MeshBasicMaterial({ color: '#bfe3f0' }));
    win.position.set(-sgn * 0.12, 0.45, 0.06); m.add(win);
    group.add(m);
    hallDoors.push({ m, closedX: m.position.x, sgn });
  }

  /* ---------- indicator (canvas, redrawn when the car passes a floor) ---------- */
  const ic = document.createElement('canvas'); ic.width = 256; ic.height = 64;
  const ictx = ic.getContext('2d');
  const itex = new T.CanvasTexture(ic); itex.colorSpace = T.SRGBColorSpace;
  const ind = new T.Mesh(new T.PlaneGeometry(2.2, 0.55), new T.MeshBasicMaterial({ map: itex }));
  ind.position.set(el.x, H - 0.75, z1 + 0.125); ind.userData.noPick = true;
  group.add(ind);
  const drawInd = (carFloor, moving) => {
    ictx.fillStyle = '#20252c'; ictx.fillRect(0, 0, 256, 64);
    ictx.font = 'bold 36px ui-sans-serif,system-ui,sans-serif'; ictx.textAlign = 'center'; ictx.textBaseline = 'middle';
    for (let i = 0; i < nF; i++) {
      const on = i === carFloor;
      ictx.fillStyle = on ? '#ffcf4a' : '#4a4f58';
      if (on) { ictx.beginPath(); ictx.arc(34 + i * 62, 34, 24, 0, 7); ictx.fill(); ictx.fillStyle = '#20252c'; }
      ictx.fillText(String(i + 1), 34 + i * 62, 36);
    }
    if (moving) { ictx.fillStyle = '#7ee0a0'; ictx.fillRect(0, 60, 256, 4); }
    itex.needsUpdate = true;
  };
  drawInd(0, false);

  /* ---------- stairs (floors below the top) ---------- */
  const { flights, rise, xA, xB, laneA, laneB } = STAIR;
  const treadsPer = 8, run = (xB - xA) / treadsPer;
  const laneW = 1.5;
  if (floor < nF - 1) {
    const col = '#c9a878', colD = '#a98963', rail = '#5d646e';
    for (let k = 0; k < flights; k++) {
      const even = k % 2 === 0;
      const lane = even ? laneA : laneB;
      const dir = even ? 1 : -1;
      const xs = even ? xA : xB;
      const yb = k * rise;
      for (let i = 0; i < treadsPer; i++) {
        const cx = xs + dir * (i + 0.5) * run;
        b.box(run + 0.02, 0.16, laneW, i % 2 ? col : '#d2b387', cx, yb + (i + 1) * (rise / treadsPer) - 0.08, lane);
      }
      // stringers (sloped)
      const len = Math.hypot(xB - xA, rise), ang = Math.atan2(rise, xB - xA);
      for (const sz of [-1, 1]) {
        b.at((xA + xB) / 2, yb + rise / 2 - 0.25, lane + sz * (laneW / 2 + 0.03), 0, () => b.box(len, 0.34, 0.08, colD, 0, 0, 0, 0, true, 0, dir * ang * 1 + 0));
      }
      // handrail on the visible (front, +z) side of the flight
      b.at((xA + xB) / 2, yb + rise / 2 + 0.9, lane + laneW / 2 + 0.03, 0, () => b.box(len, 0.06, 0.06, rail, 0, 0, 0, 0, false, 0, dir * ang));
      for (let i = 0; i <= treadsPer; i += 2) {
        const cx = xs + dir * i * run;
        b.box(0.05, 0.9, 0.05, rail, cx, yb + i * (rise / treadsPer) + 0.45, lane + laneW / 2 + 0.03, 0, false);
      }
      // landing at the end of the flight (spans both lanes)
      const lx = even ? xB + 0.25 : xA - 0.25;
      b.box(0.5, 0.2, laneA - laneB + laneW, '#cdb48c', lx, yb + rise - 0.1, (laneA + laneB) / 2);
    }
    // starting landing + top exit pad
    b.box(0.5, 0.2, laneW, '#cdb48c', xA - 0.25, -0.1, laneA);
    b.box(1.6, 0.14, 2.3, '#cdb48c', xB - 0.2, P - 0.07 - 0.02, laneA + 0.6);
  }
  // safety rail around the stairwell hole on floors that receive stairs
  if (floor > 0) {
    const rail = '#5d646e';
    const hx0 = st.x - st.w / 2, hx1 = st.x + st.w / 2, hz1 = st.z + st.d / 2 - 0.0;
    b.box(hx1 - hx0 - 2.2, 0.06, 0.06, rail, (hx0 + hx1 - 2.2) / 2 - 0.0, 1.0, hz1 + 0.05, 0, false);
    for (let x = hx0 + 0.1; x < hx1 - 2.2; x += 1.0) b.box(0.05, 1.0, 0.05, rail, x, 0.5, hz1 + 0.05, 0, false);
    b.box(0.06, 0.06, 4.4, rail, hx0 + 0.05, 1.0, st.z - 0.2, 0, false);
    for (let z = st.z - 2.3; z < hz1; z += 1.1) b.box(0.05, 1.0, 0.05, rail, hx0 + 0.05, 0.5, z, 0, false);
  }

  env.core = { hallDoors, drawInd, ind };
}

/* ============================================================ elevator car + controller */
export function createElevator(env) {
  const { T, data, clock, bus, floorY } = env;
  const el = data.elevator;
  const car = new T.Group();
  car.position.set(el.x, 0, el.z);
  car.userData.noPick = true;
  const cw = 3.7, cd = 3.7, ch = 3.45;
  const ob = new env.Batch(T);
  ob.box(cw, 0.2, cd, '#c9b08a', 0, -0.08, 0);
  ob.box(cw, 0.16, cd, '#e9eef3', 0, ch, 0);
  ob.box(cw - 0.2, 0.06, cd - 0.2, '#fff6cf', 0, ch - 0.11, 0, 0, false);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ob.box(0.14, ch, 0.14, '#4a5560', px * cw / 2, ch / 2, pz * cd / 2);
  ob.box(cw - 0.1, ch - 0.3, 0.1, '#e8d9bd', 0, ch / 2, -cd / 2 + 0.05);
  ob.box(cw - 0.5, 0.08, 0.12, '#8d949e', 0, 1.0, -cd / 2 + 0.17, 0, false);
  ob.box(0.1, 0.1, cd - 0.3, '#8d949e', -cw / 2 + 0.2, 1.0, 0, 0, false);
  ob.box(0.1, 0.1, cd - 0.3, '#8d949e', cw / 2 - 0.2, 1.0, 0, 0, false);
  ob.box(0.5, 0.26, 0.05, '#20252c', cw / 2 - 0.5, 2.0, cd / 2 - 0.05, 0, false);
  const carMats = { vc: new T.MeshLambertMaterial({ vertexColors: true }), glass: new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false }) };
  ob.build(car, carMats.vc, env.carLineMat, 'car');
  const gb = new env.Batch(T);
  gb.box(0.05, ch - 0.3, cd - 0.3, '#cfeaf4', -cw / 2 + 0.03, ch / 2, 0, 0, false);
  gb.box(0.05, ch - 0.3, cd - 0.3, '#cfeaf4', cw / 2 - 0.03, ch / 2, 0, 0, false);
  gb.build(car, carMats.glass, env.carLineMat, 'car-glass');
  // sliding car doors
  const doorW = el.doorW, halfW = doorW / 2;
  const carDoors = [];
  for (const sgn of [-1, 1]) {
    const m = new T.Mesh(new T.BoxGeometry(halfW - 0.02, 3.2, 0.08), new T.MeshLambertMaterial({ color: METAL_D }));
    m.position.set(sgn * halfW / 2, 1.6, cd / 2 - 0.02);
    m.add(new T.LineSegments(new T.EdgesGeometry(m.geometry), env.carLineMat));
    m.userData.noPick = true;
    car.add(m);
    carDoors.push({ m, closedX: m.position.x, sgn });
  }
  // lift the whole car group onto floor 0's group root (world space under world.group)
  env.worldGroup.add(car);

  const S = { carY: 0, atFloor: 0, moveTo: null, doorsAmt: Array(data.floors.length).fill(0), doorsTarget: Array(data.floors.length).fill(0), doorWaiters: [], queue: [], busy: false, indFloor: 0, moving: false };
  const setCarY = (y) => { S.carY = y; car.position.y = y; };
  const nearestFloor = () => Math.max(0, Math.min(data.floors.length - 1, Math.round(S.carY / data.floorPitch)));
  const applyDoors = () => {
    const fl = S.atFloor;
    for (let i = 0; i < data.floors.length; i++) {
      const a = S.doorsAmt[i];
      for (const d of env.cores[i].hallDoors) d.m.position.x = d.closedX + d.sgn * a * (halfW - 0.02);
    }
    const ca = S.doorsAmt[fl] ?? 0;
    for (const d of carDoors) d.m.position.x = d.closedX + d.sgn * ca * (halfW - 0.02);
  };

  const resolveDone = () => {
    const keep = [];
    for (const w of S.doorWaiters) {
      if (Math.abs(S.doorsAmt[w.floor] - w.target) < 0.001) w.res(); else keep.push(w);
    }
    S.doorWaiters = keep;
  };
  let moveWait = null;

  const api = {
    acquire() {
      return new Promise((res) => {
        const grant = () => {
          S.busy = true;
          let released = false;
          res(() => { if (released) return; released = true; S.busy = false; const n = S.queue.shift(); if (n) n(); });
        };
        if (!S.busy) grant(); else S.queue.push(grant);
      });
    },
    open(floor) {
      if (Math.abs(S.carY - floorY(floor)) > 0.3 && !clock.seeking) { console.error(`[world.elevator] open(${floor}) but car is at ${S.carY.toFixed(1)}`); return Promise.resolve(); }
      S.atFloor = floor;
      S.doorsTarget[floor] = 1;
      bus.emit('elevator:state', { floor, doors: 'open' });
      if (clock.seeking) { S.doorsAmt[floor] = 1; applyDoors(); return Promise.resolve(); }
      return new Promise((res) => S.doorWaiters.push({ floor, target: 1, res }));
    },
    close(floor) {
      S.doorsTarget[floor] = 0;
      bus.emit('elevator:state', { floor, doors: 'closed' });
      if (clock.seeking) { S.doorsAmt[floor] = 0; applyDoors(); return Promise.resolve(); }
      return new Promise((res) => S.doorWaiters.push({ floor, target: 0, res }));
    },
    moveTo(floor) {
      const y1 = floorY(floor);
      if (clock.seeking || Math.abs(y1 - S.carY) < 0.01) { setCarY(y1); S.atFloor = floor; env.cores.forEach((c) => c.drawInd(floor, false)); S.indFloor = floor; applyDoors(); return Promise.resolve(); }
      // doors must be shut before moving
      for (let i = 0; i < S.doorsTarget.length; i++) { S.doorsTarget[i] = 0; }
      bus.emit('elevator:state', { floor: nearestFloor(), doors: 'moving' });
      return new Promise((res) => {
        S.moving = true;
        const y0 = S.carY;
        const dur = Math.max(0.6, (Math.abs(y1 - y0) / data.elevator.speed) * 1.12);
        S.moveTo = { y0, y1, t: 0, dur, res, floor };
      });
    },
    carPos: () => new T.Vector3(el.x, S.carY, el.z + 0.3),
    doorPos: (floor) => new T.Vector3(el.x, floorY(floor), data.elevator.doorZ - 0.5),
  };

  function update(dt) {
    if (S.moveTo) {
      const m = S.moveTo;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setCarY(m.y0 + (m.y1 - m.y0) * e);
      const nf = nearestFloor();
      if (nf !== S.indFloor) { S.indFloor = nf; env.cores.forEach((c) => c.drawInd(nf, true)); }
      if (k >= 1) {
        S.moveTo = null; S.moving = false; S.atFloor = m.floor; S.indFloor = m.floor;
        env.cores.forEach((c) => c.drawInd(m.floor, false));
        bus.emit('elevator:state', { floor: m.floor, doors: 'closed' });
        applyDoors();
        m.res();
      }
    }
    let changed = false;
    for (let i = 0; i < S.doorsAmt.length; i++) {
      const tg = S.doorsTarget[i], a = S.doorsAmt[i];
      if (a !== tg) {
        const na = a + Math.sign(tg - a) * Math.min(Math.abs(tg - a), dt / 0.7);
        S.doorsAmt[i] = na; changed = true;
      }
    }
    if (changed) { applyDoors(); resolveDone(); }
  }

  function reset() {
    S.moveTo = null; S.moving = false;
    setCarY(0); S.atFloor = 0; S.indFloor = 0;
    S.doorsAmt.fill(0); S.doorsTarget.fill(0);
    const q = S.queue.splice(0);
    S.busy = false;
    for (const w of S.doorWaiters.splice(0)) w.res();
    for (const g of q) g();       // wake anyone still queued (they will find a closed, idle elevator)
    S.busy = false;
    env.cores.forEach((c) => c.drawInd(0, false));
    applyDoors();
  }
  return { api, update, reset, car, state: S };
}
