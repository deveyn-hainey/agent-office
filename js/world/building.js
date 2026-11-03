// Shell of each floor: slab (with stairwell/shaft holes), colored edge strip, back walls, baseboards, floor sign,
// glass conference rooms with sliding doors, dotted room annotations.
import { shade, mix } from './batch.js';

export const BERRY = '#870b64';
const CAP = '#fafafb', WHITE = '#ffffff', WALL = '#dedfe3', STRIP = '#121316';
export const BASE_H = 12;
const SANS = 'Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

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
  const topTex = tex.floor[floor].clone();
  topTex.needsUpdate = true;
  topTex.repeat.set(1 / 8, 1 / 8);
  topTex.offset.set(0, 0);
  const slabGeo = extrude(TH);
  slabGeo.translate(0, -TH, 0);
  const capMat = new T.MeshStandardMaterial({ map: topTex, roughness: 0.7 });
  const sideMat = new T.MeshStandardMaterial({ color: WHITE, roughness: 0.8 });
  const slab = new T.Mesh(slabGeo, [capMat, sideMat]);
  slab.userData.noPick = true; slab.name = 'slab'; slab.receiveShadow = true; slab.castShadow = true;
  group.add(slab);

  /* ---------- white fascia band under the slab (black vertical window strips on the +z / +x faces) ---------- */
  const bandH = floor === 0 ? BASE_H : 3.4, storeys = floor === 0 ? 3 : 1;
  const bandGeo = extrude(bandH);
  bandGeo.translate(0, -TH - bandH, 0);
  const band = new T.Mesh(bandGeo, new T.MeshStandardMaterial({ color: WHITE, roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.18 }));
  band.userData.noPick = true; band.name = 'slab-strip'; band.castShadow = true; band.receiveShadow = true;
  group.add(band);
  {
    const sh = bandH / storeys, stripH = storeys > 1 ? sh - 1.4 : bandH - 1.0;
    // sparse window groups: a few bands per face with generous white wall between them
    const spacing = 1.7, grp = floor === 0 ? [[0.27, 2], [0.73, 2]] : [[0.5, 2]];
    const faceGroups = (len, lo) => {
      const out = [];
      for (const [f, n] of grp) for (let i = 0; i < n; i++) out.push(lo + len * f + (i - (n - 1) / 2) * spacing);
      return out;
    };
    const xs = faceGroups(xmax - xmin, xmin), zs = faceGroups(zmax - zmin, zmin);
    for (let st = 0; st < storeys; st++) {
      const cy = -TH - bandH + st * sh + sh / 2;
      for (const x of xs) b.box(0.55, stripH, 0.06, STRIP, x, cy, zmax + 0.02, 0, false);
      for (const z of zs) b.box(0.06, stripH, 0.55, STRIP, xmax + 0.02, cy, z, 0, false);
    }
    // thin accent line along the slab edge (very faint floor tint)
    b.box(xmax - xmin, 0.12, 0.05, mix(accent, '#ffffff', 0.35), (xmin + xmax) / 2, -TH + 0.0 - 0.06, zmax + 0.03, 0, false);
    b.box(0.05, 0.12, zmax - zmin, mix(accent, '#ffffff', 0.35), xmax + 0.03, -TH - 0.06, (zmin + zmax) / 2, 0, false);
    if (floor === 0) {   // soft ground shadow catcher under the whole building
      const gm = new T.Mesh(new T.PlaneGeometry(400, 400), new T.ShadowMaterial({ opacity: 0.08 }));
      gm.rotation.x = -Math.PI / 2; gm.position.y = -TH - bandH - 0.03; gm.receiveShadow = true; gm.userData.noPick = true; gm.name = 'ground';
      group.add(gm);
    }
  }

  /* ---------- back walls ---------- */
  const wt = 0.5;
  const backLen = xmax - xmin, leftLen = zmax - zmin;
  const dado = shade(WALL, -0.05), tint = mix(BERRY, '#ffffff', 0.25);
  // back wall (z from -14.4 to -13.9)
  b.box(backLen, H, wt, WALL, (xmin + xmax) / 2, H / 2, zmin + wt / 2, 0, false);
  b.box(backLen - 0.02, 1.15, wt + 0.02, dado, (xmin + xmax) / 2, 0.575, zmin + wt / 2, 0, false);
  b.box(backLen + 0.06, 0.22, wt + 0.1, CAP, (xmin + xmax) / 2, H + 0.11, zmin + wt / 2 - 0.0, 0, false);
  b.box(backLen - 0.5, 0.2, 0.14, CAP, (xmin + xmax) / 2 + 0.2, 0.1, zmin + wt + 0.02, 0, false);   // baseboard
  // left wall
  b.box(wt, H, leftLen, WALL, xmin + wt / 2, H / 2, (zmin + zmax) / 2, 0, false);
  b.box(wt + 0.02, 1.15, leftLen - 0.02, dado, xmin + wt / 2, 0.575, (zmin + zmax) / 2, 0, false);
  b.box(wt + 0.1, 0.22, leftLen + 0.06, CAP, xmin + wt / 2, H + 0.11, (zmin + zmax) / 2, 0, false);
  b.box(0.14, 0.2, leftLen - 0.5, CAP, xmin + wt + 0.02, 0.1, (zmin + zmax) / 2 + 0.2, 0, false);
  // corner post
  b.box(0.7, H + 0.22, 0.7, CAP, xmin + 0.3, (H + 0.22) / 2, zmin + 0.3, 0, false);
  // faint accent stripe along the walls
  b.box(backLen - 0.4, 0.09, 0.08, tint, (xmin + xmax) / 2 + 0.2, 1.2, zmin + wt + 0.0, 0, false);
  b.box(0.08, 0.09, leftLen - 0.4, tint, xmin + wt + 0.0, 1.2, (zmin + zmax) / 2 + 0.2, 0, false);

  /* ---------- thin white railings on the open edges (+z front, +x right) ---------- */
  {
    const rail = (len, alongX, fixed, start) => {
      const n = Math.max(2, Math.round(len / 2.2));
      if (alongX) {
        b.box(len, 0.07, 0.1, CAP, start + len / 2, 1.45, fixed, 0, false);
        b.box(len, 0.07, 0.07, CAP, start + len / 2, 0.75, fixed, 0, false);
        b.box(len, 0.12, 0.1, CAP, start + len / 2, 0.06, fixed, 0, false);
        for (let i = 0; i <= n; i++) b.box(0.08, 1.45, 0.08, CAP, start + (len * i) / n, 0.72, fixed, 0, false);
      } else {
        b.box(0.1, 0.07, len, CAP, fixed, 1.45, start + len / 2, 0, false);
        b.box(0.07, 0.07, len, CAP, fixed, 0.75, start + len / 2, 0, false);
        b.box(0.1, 0.12, len, CAP, fixed, 0.06, start + len / 2, 0, false);
        for (let i = 0; i <= n; i++) b.box(0.08, 1.45, 0.08, CAP, fixed, 0.72, start + (len * i) / n, 0, false);
      }
    };
    rail(xmax - xmin - 0.2, true, zmax - 0.1, xmin + 0.1);
    rail(zmax - zmin - 0.2, false, xmax - 0.1, zmin + 0.1);
  }

  /* ---------- wall sign (left wall) ---------- */
  {
    const f = data.floors[floor];
    const c = document.createElement('canvas'); c.width = 840; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; rr(g, 4, 4, 832, 152, 40); g.fill();
    g.fillStyle = BERRY; rr(g, 22, 22, 116, 116, 30); g.fill();
    g.fillStyle = '#ffffff'; g.font = `700 74px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(f.number), 80, 82);
    g.fillStyle = accent; g.beginPath(); g.arc(176, 80, 12, 0, 7); g.fill();
    g.fillStyle = '#16171b'; g.textAlign = 'left'; g.font = `700 70px ${SANS}`;
    g.fillText(f.name.replace(' / ', ' & '), 204, 84);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    const m = new T.Mesh(new T.PlaneGeometry(4.3, 0.82), new T.MeshBasicMaterial({ map: t, transparent: true }));
    m.position.set(xmin + wt + 0.04, 5.72, -11.55); m.rotation.y = Math.PI / 2; m.userData.noPick = true;
    group.add(m);
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
  const frame = mix(BERRY, '#ffffff', 0.78);
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
      placeG(() => glassB.box(len - 0.06, H - 0.4, 0.05, '#d6ecf5', mid, H / 2, 0, 0, false));
      place(() => {
        b.box(len, 0.12, 0.12, frame, mid, H - 0.06, 0, 0, false);
        b.box(len, 0.16, 0.14, frame, mid, 0.08, 0, 0, false);
        const n = Math.max(1, Math.round(len / 3.2));
        for (let i = 0; i <= n; i++) b.box(0.08, H, 0.1, frame, U(s + (len * i) / n), H / 2, 0, 0, false);
      });
    }
    for (const gp of w.gaps || []) {
      const gw = gp.to - gp.from, cx = (gp.from + gp.to) / 2;
      place(() => {
        b.box(gw + 0.2, 0.7, 0.2, frame, U(cx), H - 0.35, 0, 0, false);              // header
        b.box(0.1, H, 0.18, frame, U(gp.from), H / 2, 0, 0, false);          // jambs
        b.box(0.1, H, 0.18, frame, U(gp.to), H / 2, 0, 0, false);
        b.box(gw + 0.2, 0.05, 0.3, '#c9ccd2', U(cx), 0.03, 0, 0, false);    // threshold
      });
      // sliding leaf (animated)
      const longer = (gp.from - a) >= (e - gp.to) ? -1 : 1;   // slide toward the longer wall piece
      const leaf = new T.Group();
      const pane = new T.Mesh(new T.BoxGeometry(gw - 0.1, H - 0.9, 0.06), mats.doorGlass);
      pane.position.y = (H - 0.7) / 2 + 0.12;
      const bar1 = new T.Mesh(new T.BoxGeometry(0.1, H - 0.9, 0.1), new T.MeshStandardMaterial({ color: frame, roughness: 0.5 }));
      bar1.position.set(-(gw / 2 - 0.1), pane.position.y, 0);
      const bar2 = bar1.clone(); bar2.position.x = gw / 2 - 0.1;
      const handle = new T.Mesh(new T.BoxGeometry(0.06, 1.0, 0.1), new T.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.4 }));
      handle.position.set(longer * -(gw / 2 - 0.35), 2.2, 0.08);
      const top = new T.Mesh(new T.BoxGeometry(gw - 0.1, 0.12, 0.1), bar1.material);
      top.position.set(0, H - 0.84, 0);
      const bot = top.clone(); bot.position.y = 0.18;
      leaf.add(pane, bar1, bar2, handle, top, bot);
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
  glassB.build(group, mats.glass, env.lineMat, 'glass', false);
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
      font: '600 11px/1.2 Inter,system-ui,-apple-system,sans-serif', color: '#3a3b40', background: '#ffffff', border: '0',
      borderRadius: '999px', padding: '3px 10px', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(20,22,28,.14)',
    });
    const lab = scene.css2d(el);
    lab.position.set(r.x, r.glass ? 0.2 : 0.14, r.z + r.d / 2 + (r.glass ? 0.8 : -0.15));
    g.add(lab);
    labels.push(lab);
  }
  if (pts.length) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const ln = new T.LineSegments(geo, new T.LineDashedMaterial({ color: '#b4b7be', dashSize: 0.34, gapSize: 0.26, transparent: true, opacity: 0.9 }));
    ln.computeLineDistances();
    ln.userData.noPick = true;
    g.add(ln);
  }
  group.add(g);
  env.annot = { group: g, labels };
}
