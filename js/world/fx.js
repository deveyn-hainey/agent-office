// Particle effects (one THREE.Points draw call): steam, confetti, puff, sparkle, ballot ring.
const MAX = 900;

export function createFx(T, scene3, getPixelScale) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), alpha = new Float32Array(MAX), size = new Float32Array(MAX), rot = new Float32Array(MAX), shape = new Float32Array(MAX);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  geo.setAttribute('alpha', new T.BufferAttribute(alpha, 1));
  geo.setAttribute('size', new T.BufferAttribute(size, 1));
  geo.setAttribute('rot', new T.BufferAttribute(rot, 1));
  geo.setAttribute('shape', new T.BufferAttribute(shape, 1));
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 10 } },
    vertexShader: `
      attribute vec3 color; attribute float alpha; attribute float size; attribute float rot; attribute float shape;
      varying vec3 vC; varying float vA; varying float vR; varying float vS;
      uniform float uScale;
      void main(){ vC=color; vA=alpha; vR=rot; vS=shape;
        vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = size*uScale; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `
      varying vec3 vC; varying float vA; varying float vR; varying float vS;
      void main(){
        vec2 p = gl_PointCoord-0.5; float c=cos(vR), s=sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
        float a = 0.0;
        if (vS < 0.5) { a = smoothstep(0.5, 0.15, length(p)); }                       // soft puff
        else if (vS < 1.5) { a = (abs(p.x) < 0.36 && abs(p.y) < 0.2) ? 1.0 : 0.0; }     // confetti strip
        else if (vS < 2.5) { float d = abs(p.x)+abs(p.y); float e = min(abs(p.x),abs(p.y)); a = (d<0.5 && e<0.14+0.2*(0.5-d)) ? 1.0 : 0.0; } // 4-point star
        else { float l = length(p); a = smoothstep(0.5,0.42,l) * smoothstep(0.3,0.38,l); }  // ring
        if (a < 0.02) discard;
        gl_FragColor = vec4(vC, a*vA);
      }`,
  });
  const pts = new T.Points(geo, mat);
  pts.frustumCulled = false; pts.userData.noPick = true; pts.renderOrder = 10;
  scene3.add(pts);

  const P = [];   // active particles
  const free = [];
  for (let i = MAX - 1; i >= 0; i--) free.push(i);
  const c = new T.Color();

  function spawn(o) {
    const i = free.pop();
    if (i === undefined) return;
    P.push({ i, age: 0, ...o });
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = [o.x, o.y, o.z][k];
    c.set(o.color || '#ffffff'); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    shape[i] = o.shape || 0; rot[i] = o.rot0 || 0; size[i] = o.size0; alpha[i] = 0;
  }
  const R = Math.random;
  const CONF = ['#e25a4f', '#f2b632', '#3fae5a', '#4c8dff', '#9b6bff', '#ef5da8', '#1fa3a3', '#ff8a4c'];

  const kinds = {
    steam(x, y, z) {
      spawn({ x, y, z, vx: (R() - 0.5) * 0.08, vy: 0.55 + R() * 0.25, vz: (R() - 0.5) * 0.08, life: 2.2 + R(), size0: 0.4, size1: 1.3, a0: 0.5, color: '#ffffff', shape: 0, sway: R() * 6 });
    },
    puff(x, y, z) {
      for (let n = 0; n < 12; n++) {
        const a = R() * 6.28, sp = 1.2 + R() * 1.4;
        spawn({ x, y: y + 1, z, vx: Math.cos(a) * sp, vy: 0.4 + R() * 1.2, vz: Math.sin(a) * sp, drag: 3, life: 0.7 + R() * 0.3, size0: 0.6, size1: 1.6, a0: 0.85, color: '#ffffff', shape: 0 });
      }
    },
    confetti(x, y, z) {
      for (let n = 0; n < 70; n++) {
        const a = R() * 6.28, sp = 2 + R() * 5;
        spawn({ x: x + (R() - 0.5), y: y + 1.5, z: z + (R() - 0.5), vx: Math.cos(a) * sp * 0.8, vy: 5 + R() * 6, vz: Math.sin(a) * sp * 0.8, g: 9, drag: 0.6, life: 2.6 + R() * 1.2, size0: 0.26, size1: 0.26, a0: 1, color: CONF[Math.floor(R() * CONF.length)], shape: 1, spin: (R() - 0.5) * 14, rot0: R() * 6 });
      }
    },
    sparkle(x, y, z) {
      for (let n = 0; n < 9; n++) {
        const a = R() * 6.28, sp = 0.6 + R() * 1.4;
        spawn({ x: x + (R() - 0.5) * 0.8, y: y + 1 + R() * 1.4, z: z + (R() - 0.5) * 0.8, vx: Math.cos(a) * sp * 0.4, vy: 0.5 + R() * 1.0, vz: Math.sin(a) * sp * 0.4, life: 0.9 + R() * 0.6, size0: 0.15, size1: 0.9, a0: 1, color: n % 2 ? '#ffe27a' : '#ffffff', shape: 2, spin: (R() - 0.5) * 4, pop: true });
      }
    },
    ballot(x, y, z) {
      spawn({ x, y: y + 2.6, z, vx: 0, vy: 0.5, vz: 0, life: 1.1, size0: 0.4, size1: 2.2, a0: 0.9, color: '#f2b632', shape: 3 });
      for (let n = 0; n < 5; n++) spawn({ x, y: y + 2.6, z, vx: (R() - 0.5) * 2, vy: 1.8 + R(), vz: (R() - 0.5) * 2, g: 5, life: 0.9, size0: 0.2, size1: 0.2, a0: 1, color: '#fffdf6', shape: 1, spin: (R() - 0.5) * 8 });
    },
  };

  function update(dt) {
    mat.uniforms.uScale.value = getPixelScale();
    for (let n = P.length - 1; n >= 0; n--) {
      const p = P[n];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { alpha[p.i] = 0; size[p.i] = 0; free.push(p.i); P.splice(n, 1); continue; }
      if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f; p.vy *= f; }
      if (p.g) p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.sway !== undefined) p.x += Math.sin(p.age * 3 + p.sway) * 0.25 * dt;
      const i = p.i;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      size[i] = p.size0 + (p.size1 - p.size0) * (p.pop ? Math.sin(k * Math.PI) : k);
      alpha[i] = p.a0 * (k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 1.6));
      if (p.spin) rot[i] += p.spin * dt;
    }
    for (const a of ['position', 'color', 'alpha', 'size', 'rot', 'shape']) geo.attributes[a].needsUpdate = true;
  }

  return { spawn: (kind, x, y, z) => kinds[kind]?.(x, y, z), kinds, update, count: () => P.length, object: pts };
}
