// Day/night from real Denver time: hemisphere + sun, window sky, lamp pools, sun patches.
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (h, c, w) => Math.max(0, 1 - Math.abs(h - c) / w);

export function createLighting(env) {
  const { T, scene3, lights, tex, floorMats } = env;
  const hemi = new T.HemisphereLight('#ffffff', '#e8dcc4', 1.25);
  hemi.name = 'hemi';
  scene3.add(hemi);
  lights.ambient.intensity = 1.0;
  lights.sun.intensity = 1.0;
  lights.sun.position.set(30, 60, 24);

  const C = (h) => new T.Color(h);
  const cA = { day: C('#ffffff'), warm: C('#ffdcc0'), night: C('#8e9bd2') };
  const cS = { day: C('#fff4e0'), warm: C('#ff9f63'), night: C('#8196df') };
  const cHs = { day: C('#ffffff'), warm: C('#ffe2cc'), night: C('#9aa9e6') };
  const cHg = { day: C('#e8dcc4'), warm: C('#d9b99a'), night: C('#645f86') };
  const cBg = { day: C('#f4ecdc'), warm: C('#f3dfc8'), night: C('#c7c5d8') };
  const tmp = new T.Color();
  const mix3 = (o, d, w, n, out) => { out.copy(o.day).lerp(o.night, n); if (w > 0) out.lerp(o.warm, w); return out; };

  const st = { hours: 12, manual: null, auto: true, d: 1, n: 0, warm: 0, lastSky: -99, lastAuto: -99 };

  function skyDraw(h, d, warm, n) {
    const g = env.tex.skyCtx, W = 64, H = 128;
    const top = new T.Color('#7ec2f2').lerp(new T.Color('#0d1633'), n);
    const bot = new T.Color('#d8eeff').lerp(new T.Color('#2a3b72'), n);
    if (warm > 0) { top.lerp(new T.Color('#e9a0a8'), warm * 0.55); bot.lerp(new T.Color('#ffd09a'), warm * 0.9); }
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(1, '#' + bot.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (n > 0.15) {
      g.fillStyle = `rgba(255,255,240,${Math.min(1, (n - 0.15) * 1.4)})`;
      for (let i = 0; i < 30; i++) { const x = (i * 37) % W, y = (i * 53) % (H * 0.8); g.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1); }
      g.beginPath(); g.arc(46, 22, 7, 0, 7); g.fill();
      g.fillStyle = gr; g.beginPath(); g.arc(49, 20, 6, 0, 7); g.fill();
    }
    if (d > 0.2) {
      g.fillStyle = `rgba(255,255,255,${0.85 * d})`;
      for (const [x, y, r] of [[16, 80, 11], [26, 82, 9], [8, 84, 8], [48, 50, 8], [56, 52, 6], [40, 52, 6]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    }
    tex.sky.needsUpdate = true;
  }

  function apply(h) {
    const d = sm(5.6, 7.6, h) * (1 - sm(17.4, 19.4, h));
    const n = 1 - d;
    const warm = Math.max(bump(h, 18.4, 1.6) * 0.95, bump(h, 6.3, 1.0) * 0.8) * (d > 0.02 ? 1 : 0.6);
    st.d = d; st.n = n; st.warm = warm; st.hours = h;
    mix3(cA, null, warm, n, lights.ambient.color); lights.ambient.intensity = 1.0 - 0.22 * n;
    mix3(cS, null, warm, n, lights.sun.color); lights.sun.intensity = 0.35 + 0.75 * d + 0.25 * warm;
    // evening sun is lower / from the left; night "moon" from above-left
    const az = 0.2 + (1 - d) * 0.5 + warm * 0.25;
    lights.sun.position.set(30 + Math.sin(az) * 30 - 10, 50 + 10 * d, 24);
    mix3(cHs, null, warm, n, hemi.color); mix3(cHg, null, warm, n, hemi.groundColor); hemi.intensity = 1.25 - 0.3 * n;
    mix3(cBg, null, warm * 0.8, n, tmp);
    scene3.background.copy(tmp);
    if (env.renderer) env.renderer.setClearColor(tmp, 1);
    for (const m of floorMats) {
      m.lampPool.opacity = Math.min(0.7, n * 1.0 + warm * 0.2) * 0.75;
      m.patch.opacity = d * (1 - warm * 0.4) * 0.1;
      m.patch.color.set('#fff2c4').lerp(new T.Color('#ffc78a'), warm);
    }
    if (Math.abs(h - st.lastSky) > 0.012) { st.lastSky = h; skyDraw(h, d, warm, n); }
  }

  const api = {
    /** hours (0-24 float) | Date | null (= back to auto, real Denver time) */
    setTimeOfDay(v) {
      if (v == null || v === 'auto') { st.manual = null; st.auto = true; st.lastAuto = -99; return; }
      let h;
      if (v instanceof Date) { const dn = env.denverNow(v); h = dn.hours; } else h = ((+v % 24) + 24) % 24;
      st.manual = h; st.auto = false; st.lastSky = -99; apply(h);
    },
    state: () => ({ hours: st.hours, auto: st.auto, daylight: st.d, night: st.n, warm: st.warm }),
    update(dt, realT) {
      if (st.auto && realT - st.lastAuto > 1.5) { st.lastAuto = realT; apply(env.clock.denver().hours); }
    },
    isNight: () => st.n > 0.5,
    nightAmt: () => st.n,
  };
  apply(env.clock.denver().hours);
  return api;
}
