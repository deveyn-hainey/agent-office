// Shell of each floor: slab (with stairwell/shaft holes), colored edge strip, back walls, baseboards, floor sign,
// glass conference rooms with sliding doors, dotted room annotations.
import { shade, mix } from './batch.js';

const CAP = '#fffdf6';

export function buildShell(env) {
  const { T, floor, data, accent, b, group, mats, tex } = env;
  const fs = data.floorSize, W = fs.w, D = fs.d, H = data.wallHeight, TH = data.slabThickness;
  const xmin = -W / 2 - 0.5, xmax = W / 2, zmin = -D / 2 - 0.5, zmax = D / 2;

  /* ---------- slab ---------- */
  const shape = new T.Shape();
  shape.moveTo(xmin, -zmin); shape.lineTo(xmax, -zmin); shape.lineTo(xmax, -zmax); shape.lineTo(xmin, -zmax); shape.closePath();
  if (floor > 0) {
    const holes = [];
    const st = data.stairs, el = data.elevator;
    holes.push([st.x - st.w / 2, st.z - st.d / 2, st.x + st.w / 2, st.z + st.d / 2 - 0.0]);
    holes.push([el.x - el.w / 2, el.z - el.d / 2, el.x + el.w / 2, el.z + el.d / 2]);
    for (const [x0, z0, x1, z1] of holes) {
      const h = new T.Path();
      h.moveTo(x0, -z0); h.lineTo(x0, -z1); h.lineTo(x1, -z1); h.lineTo(x1, -z0); h.closePath();
      shape.holes.push(h);
    }
  }
  const extrude = (depth) => {
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const edgeMat = env.lineMat;
  const topTex = tex.floor[floor].clone();
  topTex.needsUpdate = true;
  topTex.repeat.set(1 / 8, 1 / 8);
  topTex.offset.set(0, 0);
  const slabGeo = extrude(TH);
  slabGeo.translate(0, -TH, 0);
  const capMat = new T.MeshLambertMaterial({ map: topTex });
  const sideMat = new T.MeshLambertMaterial({ color: '#fbf6ea' });
  const slab = new T.Mesh(slabGeo, [capMat, sideMat]);
  slab.userData.noPick = true; slab.name = 'slab';
  group.add(slab);
  const stripH = 1.25;
  const stripGeo = extrude(stripH);
  stripGeo.translate(0, -TH - stripH, 0);
  const strip = new T.Mesh(stripGeo, new T.MeshLambertMaterial({ color: accent }));
  strip.userData.noPick = true; strip.name = 'slab-strip';
  group.add(strip);
  for (const g of [slabGeo, stripGeo]) {
    const l = new T.LineSegments(new T.EdgesGeometry(g, 20), edgeMat);
    l.userData.noPick = true; group.add(l);
  }

  // floor label on the front edge of the colored strip (+z face), serif
  {
    const f = data.floors[floor];
    const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 1024, 128);
    g.fillStyle = shade(accent, -0.55); g.font = 'bold 76px Georgia,"Iowan Old Style",serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(`${f.number}F · ${f.name.replace(' / ', ' & ')}`, 16, 70);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(9, 9 / 8), new T.MeshBasicMaterial({ map: t, transparent: true }));
    m.position.set(xmin + 5.0, -TH - stripH / 2, zmax + 0.01); m.userData.noPick = true;
    group.add(m);
    // same label on the right-hand (+x) face
    const m2 = m.clone(); m2.position.set(xmax + 0.01, -TH - stripH / 2, zmax - 5.0 - 0.5); m2.rotation.y = Math.PI / 2; m2.userData.noPick = true; group.add(m2);
  }

  /* ---------- back walls ---------- */
  const wallCol = accent, dado = shade(accent, -0.09);
  const wt = 0.5;
  const backLen = xmax - xmin, leftLen = zmax - zmin;
  // back wall (z from -14.4 to -13.9)
  b.box(backLen, H, wt, wallCol, (xmin + xmax) / 2, H / 2, zmin + wt / 2);
  b.box(backLen - 0.02, 1.15, wt + 0.02, dado, (xmin + xmax) / 2, 0.575, zmin + wt / 2, 0, false);
  b.box(backLen + 0.06, 0.22, wt + 0.1, CAP, (xmin + xmax) / 2, H + 0.11, zmin + wt / 2 - 0.0);
  b.box(backLen - 0.5, 0.2, 0.14, CAP, (xmin + xmax) / 2 + 0.2, 0.1, zmin + wt + 0.02);   // baseboard
  // left wall
  b.box(wt, H, leftLen, wallCol, xmin + wt / 2, H / 2, (zmin + zmax) / 2);
  b.box(wt + 0.02, 1.15, leftLen - 0.02, dado, xmin + wt / 2, 0.575, (zmin + zmax) / 2, 0, false);
  b.box(wt + 0.1, 0.22, leftLen + 0.06, CAP, xmin + wt / 2, H + 0.11, (zmin + zmax) / 2);
  b.box(0.14, 0.2, leftLen - 0.5, CAP, xmin + wt + 0.02, 0.1, (zmin + zmax) / 2 + 0.2);
  // corner post
  b.box(0.7, H + 0.22, 0.7, shade(accent, -0.14), xmin + 0.3, (H + 0.22) / 2, zmin + 0.3);
  // fascia stripes along the wall (subtle wainscot rail)
  b.box(backLen - 0.4, 0.09, 0.08, shade(accent, 0.35), (xmin + xmax) / 2 + 0.2, 1.2, zmin + wt + 0.0, 0, false);
  b.box(0.08, 0.09, leftLen - 0.4, shade(accent, 0.35), xmin + wt + 0.0, 1.2, (zmin + zmax) / 2 + 0.2, 0, false);

  /* ---------- wall sign (left wall) ---------- */
  {
    const f = data.floors[floor];
    const c = document.createElement('canvas'); c.width = 840; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = CAP; rr(g, 4, 4, 832, 152, 34); g.fill();
    g.strokeStyle = '#2b2622'; g.lineWidth = 7; rr(g, 4, 4, 832, 152, 34); g.stroke();
    g.fillStyle = accent; rr(g, 22, 22, 116, 116, 24); g.fill();
    g.fillStyle = '#2b2622'; g.font = 'bold 78px Georgia,"Iowan Old Style",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`${f.number}F`, 80, 84);
    g.textAlign = 'left'; g.font = 'bold 72px Georgia,"Iowan Old Style",serif';
    g.fillText(f.name.replace(' / ', ' & '), 164, 86);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(4.3, 0.82), new T.MeshBasicMaterial({ map: t }));
    m.position.set(xmin + wt + 0.04, 5.72, -11.55); m.rotation.y = Math.PI / 2; m.userData.noPick = true;
    group.add(m);
    b.box(0.04, 0.9, 4.4, '#2b2622', xmin + wt + 0.0, 5.72, -11.55, 0, false);
  }
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/* ============================================================ glass conference rooms + sliding doors */
export function buildGlass(env) {
  const { T, floor, data, group, b, mats } = env;
  const walls = data.walls.filter((w) => w.floor === floor && w.kind === 'glass');
  if (!walls.length) return;
  const glassB = new env.Batch(T);   // pane geometry (no outlines)
  const H = data.wallHeight;
  const frame = '#4a5560';
  const doors = [];
  for (const w of walls) {
    const horiz = w.z1 === w.z2;
    const a = Math.min(horiz ? w.x1 : w.z1, horiz ? w.x2 : w.z2), z = horiz ? w.z1 : w.x1;
    const e = Math.max(horiz ? w.x1 : w.z1, horiz ? w.x2 : w.z2);
    const segs = [];
    let cur = a;
    for (const gp of [...(w.gaps || [])].sort((p, q) => p.from - q.from)) { segs.push([cur, gp.from]); cur = gp.to; }
    segs.push([cur, e]);
    const place = (fn) => (horiz ? b.at(0, 0, z, 0, fn) : b.at(z, 0, 0, Math.PI / 2, fn));
    const placeG = (fn) => (horiz ? glassB.at(0, 0, z, 0, fn) : glassB.at(z, 0, 0, Math.PI / 2, fn));
    // local frame: along-wall axis = local x; for vertical walls rotating by +90° maps local x -> -z, so mirror coordinates
    const U = (u) => (horiz ? u : -u);
    for (const [s, t] of segs) {
      if (t - s < 0.05) continue;
      const len = t - s, mid = U((s + t) / 2);
      placeG(() => glassB.box(len - 0.06, H - 0.4, 0.05, '#cfeaf4', mid, H / 2, 0, 0, false));
      place(() => {
        b.box(len, 0.16, 0.16, frame, mid, H - 0.08, 0);
        b.box(len, 0.2, 0.18, frame, mid, 0.1, 0);
        const n = Math.max(1, Math.round(len / 3.2));
        for (let i = 0; i <= n; i++) b.box(0.1, H, 0.14, frame, U(s + (len * i) / n), H / 2, 0, 0, i === 0 || i === n);
      });
    }
    for (const gp of w.gaps || []) {
      const gw = gp.to - gp.from, cx = (gp.from + gp.to) / 2;
      place(() => {
        b.box(gw + 0.2, 0.7, 0.2, frame, U(cx), H - 0.35, 0);              // header
        b.box(0.12, H, 0.2, frame, U(gp.from), H / 2, 0, 0, true);          // jambs
        b.box(0.12, H, 0.2, frame, U(gp.to), H / 2, 0, 0, true);
        b.box(gw + 0.2, 0.05, 0.3, '#2b2f36', U(cx), 0.03, 0, 0, false);    // threshold
      });
      // sliding leaf (animated)
      const longer = (gp.from - a) >= (e - gp.to) ? -1 : 1;   // slide toward the longer wall piece
      const leaf = new T.Group();
      const pane = new T.Mesh(new T.BoxGeometry(gw - 0.1, H - 0.9, 0.06), mats.doorGlass);
      pane.position.y = (H - 0.7) / 2 + 0.12;
      const fr = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(gw - 0.1, H - 0.9, 0.06)), env.lineMat);
      fr.position.copy(pane.position);
      const bar1 = new T.Mesh(new T.BoxGeometry(0.1, H - 0.9, 0.1), new T.MeshLambertMaterial({ color: frame }));
      bar1.position.set(-(gw / 2 - 0.1), pane.position.y, 0);
      const bar2 = bar1.clone(); bar2.position.x = gw / 2 - 0.1;
      const handle = new T.Mesh(new T.BoxGeometry(0.06, 1.0, 0.1), new T.MeshLambertMaterial({ color: '#c9ced6' }));
      handle.position.set(longer * -(gw / 2 - 0.35), 2.2, 0.08);
      const top = new T.Mesh(new T.BoxGeometry(gw - 0.1, 0.12, 0.1), bar1.material);
      top.position.set(0, H - 0.84, 0);
      const bot = top.clone(); bot.position.y = 0.18;
      leaf.add(pane, fr, bar1, bar2, handle, top, bot);
      leaf.traverse((o) => { if (o !== leaf) o.userData.noPick = false; });
      const closedU = cx;
      const openDelta = longer * (gw - 0.2);
      const zoff = -0.17;
      if (horiz) leaf.position.set(closedU, 0, z + zoff); else leaf.position.set(z + zoff, 0, closedU);
      if (!horiz) leaf.rotation.y = Math.PI / 2;
      leaf.userData.pick = { type: 'door', id: gp.door, floor };
      group.add(leaf);
      // "in use" sign above the door
      const sign = new T.Mesh(new T.PlaneGeometry(1.5, 0.46), mats.inUse.free);
      sign.userData.noPick = true;
      const sx = horiz ? cx : z + 0.12, sz = horiz ? z + 0.12 : cx;
      sign.position.set(sx, H - 0.2, sz); sign.rotation.y = horiz ? 0 : Math.PI / 2;
      sign.position.y = H - 0.55;
      group.add(sign);
      doors.push({ id: gp.door, leaf, horiz, closedU, openDelta, z: z + zoff, amt: 0, target: 0, waiters: [], sign, inUse: false, floor, wall: w.id });
    }
  }
  glassB.build(group, mats.glass, env.lineMat, 'glass');
  env.doors = doors;
}

/* ============================================================ dotted annotations */
export function buildAnnotations(env) {
  const { T, floor, data, group, scene } = env;
  const g = new T.Group();
  g.name = 'annotations';
  const pts = [];
  const labels = [];
  for (const r of data.rooms) {
    if (r.floor !== floor || r.annot === false) continue;
    if (r.dotted && !r.glass) {
      const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, z0 = r.z - r.d / 2, z1 = r.z + r.d / 2, y = 0.09;
      pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    }
    const el = document.createElement('div');
    el.className = 'room-label';
    el.textContent = r.label;
    Object.assign(el.style, {
      font: '600 11px/1.2 ui-sans-serif,system-ui,sans-serif', color: '#6b5f4f', background: 'rgba(255,251,242,.88)', border: '1px dashed #b9ab92',
      borderRadius: '9px', padding: '2px 8px', whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '.02em', boxShadow: '0 1px 2px rgba(43,38,34,.08)',
    });
    const lab = scene.css2d(el);
    lab.position.set(r.x, r.glass ? 0.2 : 0.14, r.z + r.d / 2 + (r.glass ? 0.8 : -0.15));
    g.add(lab);
    labels.push(lab);
  }
  if (pts.length) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const ln = new T.LineSegments(geo, new T.LineDashedMaterial({ color: '#8a7d68', dashSize: 0.34, gapSize: 0.26, transparent: true, opacity: 0.85 }));
    ln.computeLineDistances();
    ln.userData.noPick = true;
    g.add(ln);
  }
  group.add(g);
  env.annot = { group: g, labels };
}
