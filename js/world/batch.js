// Geometry batching: collect many coloured primitives (+ their EdgesGeometry outlines) into ONE mesh + ONE LineSegments.
// Usage: const b = new Batch(THREE); b.at(x,y,z,ry, () => { b.box(w,h,d,color, ox,oy,oz) ... }); b.build(parent, mat, lineMat)

export class Batch {
  constructor(THREE) {
    this.T = THREE;
    this.pos = []; this.nrm = []; this.col = []; this.lines = [];
    this.base = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._n = new THREE.Matrix3();
    this._c = new THREE.Color();
    this._v = new THREE.Vector3();
    this.stack = [];
    this._geoCache = new Map();
  }

  /** place subsequent primitives in a local frame (x,y,z,yaw); restores afterwards */
  at(x, y, z, ry, fn, rx = 0, rz = 0) {
    const T = this.T;
    this.stack.push(this.base.clone());
    const m = new T.Matrix4().compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')),
      new T.Vector3(1, 1, 1),
    );
    this.base = this.base.clone().multiply(m);
    try { fn(); } finally { this.base = this.stack.pop(); }
    return this;
  }

  _geo(key, make) {
    let g = this._geoCache.get(key);
    if (!g) { g = make(); this._geoCache.set(key, g); }
    return g;
  }

  /** add an arbitrary geometry (transformed by local matrix `lm` under the current frame) */
  geo(geometry, color, lm, edges = true, threshold = 20) {
    const T = this.T;
    const m = this._m.copy(this.base);
    if (lm) m.multiply(lm);
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(m);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { this.pos.push(p[i]); this.nrm.push(n[i]); }
    const c = this._c.set(color);
    for (let i = 0; i < p.length / 3; i++) this.col.push(c.r, c.g, c.b);
    g.dispose();
    if (edges && Batch.OUTLINES) {
      const eg = new T.EdgesGeometry(geometry, threshold);
      eg.applyMatrix4(m);
      const ep = eg.attributes.position.array;
      for (let i = 0; i < ep.length; i++) this.lines.push(ep[i]);
      eg.dispose();
    }
    return this;
  }

  _lm(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const T = this.T;
    return new T.Matrix4().compose(
      new T.Vector3(x, y, z),
      new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')),
      new T.Vector3(sx, sy, sz),
    );
  }

  /** box centred at (x,y,z) local */
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, edges = true, rx = 0, rz = 0) {
    const g = this._geo(`b${w},${h},${d}`, () => new this.T.BoxGeometry(w, h, d));
    return this.geo(g, color, this._lm(x, y, z, ry, rx, rz), edges);
  }

  /** box whose BOTTOM sits at y */
  slab(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, edges = true) {
    return this.box(w, h, d, color, x, y + h / 2, z, ry, edges);
  }

  cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 24, edges = true, ry = 0, rx = 0, rz = 0) {
    const g = this._geo(`c${rt},${rb},${h},${seg}`, () => new this.T.CylinderGeometry(rt, rb, h, seg));
    return this.geo(g, color, this._lm(x, y + h / 2, z, ry, rx, rz), edges, 35);
  }

  sphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1, edges = false) {
    const g = this._geo(`s${r},${detail}`, () => new this.T.IcosahedronGeometry(r, detail));
    return this.geo(g, color, this._lm(x, y, z, 0, 0, 0, sx, sy, sz), edges, 25);
  }

  cone(r, h, color, x = 0, y = 0, z = 0, seg = 8, edges = true, rz = 0, rx = 0) {
    const g = this._geo(`k${r},${h},${seg}`, () => new this.T.ConeGeometry(r, h, seg));
    return this.geo(g, color, this._lm(x, y + h / 2, z, 0, rx, rz), edges, 35);
  }

  get count() { return this.pos.length / 3; }

  build(parent, mat, lineMat, name = 'batch', shadows = true) {
    const T = this.T;
    const out = {};
    if (this.pos.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.nrm, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
      const mesh = new T.Mesh(g, mat);
      mesh.name = name;
      mesh.userData.noPick = true;
      mesh.castShadow = shadows; mesh.receiveShadow = shadows;
      parent.add(mesh);
      out.mesh = mesh;
    }
    if (this.lines.length) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.lines, 3));
      const ln = new T.LineSegments(g, lineMat);
      ln.name = name + '-lines';
      ln.userData.noPick = true;
      parent.add(ln);
      out.lines = ln;
    }
    for (const g of this._geoCache.values()) g.dispose();
    return out;
  }
}

Batch.OUTLINES = false;   // clean white look: no dark edge outlines

/** tiny deterministic RNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shade = (hex, k) => {
  // k>0 lighten toward white, k<0 darken toward black
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
};

export const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
};
