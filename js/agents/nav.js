// Per-floor grid navigation: blocked cells from world.json, A* (8-neighbour), string-pulling smoothing.

const INFLATE = 0.3; // agent radius used to grow obstacles

export function createNav(data) {
  const cell = data.nav?.cell || 0.5;
  const W = Math.ceil(data.floorSize.w / cell), H = Math.ceil(data.floorSize.d / cell);
  const ox = -data.floorSize.w / 2, oz = -data.floorSize.d / 2;
  const margin = data.nav?.margin ?? 0.45;
  const grids = data.floors.map((_, f) => buildGrid(f));

  function rectBlock(g, cx, cz, hw, hd, infl = INFLATE) {
    const x0 = Math.floor((cx - hw - infl - ox) / cell), x1 = Math.floor((cx + hw + infl - ox) / cell);
    const z0 = Math.floor((cz - hd - infl - oz) / cell), z1 = Math.floor((cz + hd + infl - oz) / cell);
    for (let z = Math.max(0, z0); z <= Math.min(H - 1, z1); z++) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        // test by cell centre
        const px = ox + (x + 0.5) * cell, pz = oz + (z + 0.5) * cell;
        if (Math.abs(px - cx) <= hw + infl && Math.abs(pz - cz) <= hd + infl) g[z * W + x] = 1;
      }
    }
  }
  function roundBlock(g, cx, cz, r, infl = INFLATE) {
    const rr = r + infl;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const px = ox + (x + 0.5) * cell - cx, pz = oz + (z + 0.5) * cell - cz;
      if (px * px + pz * pz <= rr * rr) g[z * W + x] = 1;
    }
  }

  function buildGrid(f) {
    const g = new Uint8Array(W * H);
    // floor-edge margin
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const px = ox + (x + 0.5) * cell, pz = oz + (z + 0.5) * cell;
      if (px < ox + margin || px > -ox - margin || pz < oz + margin || pz > -oz - margin) g[z * W + x] = 1;
    }
    for (const it of data.furniture) {
      if (it.floor !== f || !it.solid) continue;
      if (it.shape === 'round') { roundBlock(g, it.x, it.z, it.r || it.w / 2); continue; }
      const rot = Math.abs(Math.round(it.rot / (Math.PI / 2))) % 2;
      const w = rot ? it.d : it.w, d = rot ? it.w : it.d;
      rectBlock(g, it.x, it.z, w / 2, d / 2);
    }
    const e = data.elevator, st = data.stairs;
    if (e) rectBlock(g, e.x, e.z, e.w / 2, e.d / 2, 0.2);
    if (st) rectBlock(g, st.x, st.z, st.w / 2, st.d / 2, 0.2);
    for (const w of data.walls) {
      if (w.floor !== f) continue;
      const horiz = w.z1 === w.z2;
      const a = horiz ? Math.min(w.x1, w.x2) : Math.min(w.z1, w.z2), b = horiz ? Math.max(w.x1, w.x2) : Math.max(w.z1, w.z2);
      const fixed = horiz ? w.z1 : w.x1;
      const spans = [];
      let cur = a;
      for (const gap of [...(w.gaps || [])].sort((p, q) => p.from - q.from)) { spans.push([cur, gap.from]); cur = gap.to; }
      spans.push([cur, b]);
      for (const [s, en] of spans) {
        if (en - s < 0.01) continue;
        const mid = (s + en) / 2, half = (en - s) / 2, t = Math.max(w.thick || 0.2, 0.2) / 2;
        if (horiz) rectBlock(g, mid, fixed, half, t); else rectBlock(g, fixed, mid, t, half);
      }
    }
    return g;
  }

  const idx = (x, z) => z * W + x;
  const toCell = (v, o) => Math.floor((v - o) / cell);
  const cx = (x) => ox + (x + 0.5) * cell, cz = (z) => oz + (z + 0.5) * cell;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;

  function blockedAt(f, x, z) {
    const i = toCell(x, ox), j = toCell(z, oz);
    if (!inb(i, j)) return true;
    return grids[f][idx(i, j)] === 1;
  }

  // line of sight on the grid (sampled)
  function los(f, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / 0.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (blockedAt(f, x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // nearest open cell to (x,z); prefers cells in front of `facing`
  function snap(f, x, z, facing) {
    const g = grids[f];
    const i0 = Math.min(W - 1, Math.max(0, toCell(x, ox))), j0 = Math.min(H - 1, Math.max(0, toCell(z, oz)));
    if (!g[idx(i0, j0)]) return { x, z, moved: false };
    let best = null, bestS = 1e9;
    for (let r = 1; r <= 12; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !inb(i, j) || g[idx(i, j)]) continue;
        const px = cx(i), pz = cz(j);
        let s = Math.hypot(px - x, pz - z);
        if (facing != null) s -= 0.35 * ((px - x) * Math.sin(facing) + (pz - z) * Math.cos(facing)) / (s + 0.01);
        if (s < bestS) { bestS = s; best = { x: px, z: pz }; }
      }
      if (best && r >= 2) break;
    }
    return best ? { ...best, moved: true } : { x, z, moved: false };
  }

  // returns waypoints (excluding the start) ending exactly at (tx,tz); null if no route
  function findPath(f, sx, sz, tx, tz, goalFacing) {
    const g = grids[f];
    const s = snap(f, sx, sz), t = snap(f, tx, tz, goalFacing);
    if (!s.moved && !t.moved && los(f, sx, sz, tx, tz)) return [{ x: tx, z: tz }];
    const si = toCell(s.x, ox), sj = toCell(s.z, oz), ti = toCell(t.x, ox), tj = toCell(t.z, oz);
    const open = new MinHeap();
    const gs = new Float32Array(W * H).fill(Infinity);
    const came = new Int32Array(W * H).fill(-1);
    const closed = new Uint8Array(W * H);
    const hF = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    gs[idx(si, sj)] = 0;
    open.push(idx(si, sj), hF(si, sj));
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let found = false;
    while (open.size) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      if (ci === ti && cj === tj) { found = true; break; }
      for (const [dx, dz] of D) {
        const ni = ci + dx, nj = cj + dz;
        if (!inb(ni, nj) || g[idx(ni, nj)] || closed[idx(ni, nj)]) continue;
        if (dx && dz && (g[idx(ci + dx, cj)] || g[idx(ci, cj + dz)])) continue;
        const ng = gs[cur] + (dx && dz ? Math.SQRT2 : 1);
        const k = idx(ni, nj);
        if (ng < gs[k]) { gs[k] = ng; came[k] = cur; open.push(k, ng + hF(ni, nj)); }
      }
    }
    if (!found) return null;
    const pts = [];
    for (let k = idx(ti, tj); k !== -1; k = came[k]) pts.push({ x: cx(k % W), z: cz((k / W) | 0) });
    pts.reverse();
    // exact ends
    pts[0] = { x: s.moved ? s.x : sx, z: s.moved ? s.z : sz };
    if (s.moved) pts.unshift({ x: sx, z: sz });
    if (t.moved) pts.push({ x: tx, z: tz }); else pts[pts.length - 1] = { x: tx, z: tz };
    // string pulling (the start/end legs inside blocked cells are exempt from LOS)
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !(los(f, pts[a].x, pts[a].z, pts[b].x, pts[b].z))) b--;
      out.push(pts[b]);
      a = b;
    }
    out.shift();
    return out;
  }

  function debug(f) {
    const cells = [];
    const g = grids[f];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (g[idx(i, j)]) cells.push([cx(i), cz(j)]);
    return { cell, cells };
  }

  return { findPath, blockedAt, los, snap, debug, cell };
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; }
  }
  pop() {
    const a = this.a, top = a[0][1], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
