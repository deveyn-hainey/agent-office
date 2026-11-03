// Procedural canvas textures (shared across floors). Everything is generated once at boot.
import { rng } from './batch.js';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
};

export function createTextures(THREE) {
  const T = THREE;
  const tex = (c, opts = {}) => {
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (opts.repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
  };
  const out = {};

  /* ---------- floors ---------- */
  // clean white floor: very faint tile grid + speckle (tile = 8x8 world units)
  function clean(base, seed, grid = 64, tint = null) {
    const [c, g] = mk(512, 512);
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,124,135'},${0.015 + r() * 0.02})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 3, 2 + r() * 3); }
    g.strokeStyle = 'rgba(110,116,130,.10)'; g.lineWidth = 1.5;
    for (let i = 0; i <= 512 / grid; i++) { g.beginPath(); g.moveTo(i * grid, 0); g.lineTo(i * grid, 512); g.moveTo(0, i * grid); g.lineTo(512, i * grid); g.stroke(); }
    if (tint) { g.fillStyle = tint; g.fillRect(0, 0, 512, 512); }
    return tex(c, { repeat: true });
  }
  out.floor = [clean('#f6f6f7', 11, 128, 'rgba(243,198,211,.05)'), clean('#f4f5f7', 12, 64, 'rgba(188,214,242,.05)'), clean('#f4f6f5', 13, 64, 'rgba(191,227,198,.05)'), clean('#f6f5f8', 14, 64, 'rgba(205,188,240,.05)')];

  /* ---------- desk screens ---------- */
  const kw = ['#3ddc84', '#4c8dff', '#ff9f43', '#3ddc84', '#d8dbe2', '#4c8dff', '#8be0b0'];
  out.code = [0, 1, 2].map((v) => {
    const [c, g] = mk(128, 256);
    const r = rng(100 + v * 17);
    g.fillStyle = '#1a1d24'; g.fillRect(0, 0, 128, 256);
    let y = 6;
    while (y < 250) {
      const indent = Math.floor(r() * 3) * 10;
      let x = 8 + indent;
      const segs = 1 + Math.floor(r() * 3);
      for (let s = 0; s < segs; s++) {
        const w = 10 + r() * 38;
        g.fillStyle = kw[Math.floor(r() * kw.length)];
        g.fillRect(x, y, w, 4);
        x += w + 5;
        if (x > 118) break;
      }
      y += 9 + (r() < 0.12 ? 8 : 0);
    }
    const t = tex(c, { repeat: true });
    t.repeat.set(1, 0.5);
    return t;
  });
  {
    const [c, g] = mk(128, 80);
    g.fillStyle = '#1b1e25'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(10, 12, 40, 4); g.fillRect(10, 22, 28, 3);
    g.fillStyle = 'rgba(61,220,132,.35)'; g.fillRect(70, 40, 6, 20); g.fillRect(80, 30, 6, 30); g.fillRect(90, 46, 6, 14);
    out.idle = tex(c);
  }

  /* ---------- sky (windows) — redrawn by lighting ---------- */
  {
    const [c, g] = mk(64, 128);
    out.skyCanvas = c; out.skyCtx = g;
    out.sky = tex(c);
  }

  /* ---------- wall clock face ---------- */
  {
    const [c, g] = mk(256, 256);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.fillStyle = '#16171b';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const big = i % 3 === 0;
      g.save(); g.translate(128, 128); g.rotate(a);
      g.fillRect(-(big ? 5 : 3), -118, big ? 10 : 6, big ? 24 : 14);
      g.restore();
    }
    g.beginPath(); g.arc(128, 128, 8, 0, 7); g.fill();
    out.clockFace = tex(c);
  }

  /* ---------- chalk menu for the coffee bar ---------- */
  {
    const [c, g] = mk(256, 160);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#16171b'; g.font = '700 28px Inter,system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText('Coffee Bar', 128, 44);
    g.font = '500 18px Inter,system-ui,sans-serif'; g.textAlign = 'left'; g.fillStyle = '#55585f';
    g.fillText('espresso', 26, 78); g.fillText('latte', 26, 104); g.fillText('cold brew', 26, 130);
    g.textAlign = 'right'; g.fillStyle = '#16171b';
    g.fillText('2', 232, 78); g.fillText('3', 232, 104); g.fillText('3', 232, 130);
    out.menu = tex(c);
  }

  /* ---------- posters ---------- */
  function poster(seed, bg, a, b, c2, title) {
    const [c, g] = mk(160, 220);
    const r = rng(seed);
    g.fillStyle = bg; g.fillRect(0, 0, 160, 220);
    g.fillStyle = a; g.beginPath(); g.arc(50 + r() * 60, 70 + r() * 30, 34 + r() * 20, 0, 7); g.fill();
    g.fillStyle = b; g.fillRect(14, 120 + r() * 14, 132, 18 + r() * 12);
    g.fillStyle = c2;
    g.beginPath(); g.moveTo(10, 190); g.lineTo(60 + r() * 30, 130); g.lineTo(150, 190); g.closePath(); g.fill();
    g.fillStyle = '#16171b'; g.font = '700 15px Inter,system-ui,sans-serif'; g.textAlign = 'center';
    g.fillText(title, 80, 24);
    g.fillStyle = 'rgba(43,38,34,.55)'; g.fillRect(34, 200, 92, 4);
    return tex(c);
  }
  out.posters = [
    poster(1, '#ffffff', '#4c8dff', '#e8eaee', '#ffc53d', 'GAME DAY'),
    poster(2, '#f6f7f9', '#ff9f43', '#dfe3e8', '#4c8dff', 'ODDS'),
    poster(3, '#ffffff', '#a78bfa', '#e8eaee', '#34c759', 'PITCHSIDE'),
    poster(4, '#f6f7f9', '#34c759', '#dfe3e8', '#ff6b6b', 'SHIP IT'),
  ];

  /* ---------- framed abstract art: soft shapes ---------- */
  function art(seed, bg, cols) {
    const [c, g] = mk(180, 220);
    const r = rng(seed);
    g.fillStyle = bg; g.fillRect(0, 0, 180, 220);
    cols.forEach((col, i) => {
      g.fillStyle = col;
      if (seed % 2) { g.beginPath(); g.arc(40 + r() * 100, 50 + i * 55, 22 + r() * 22, 0, 7); g.fill(); }
      else { g.fillRect(14 + r() * 50, 20 + i * 62, 60 + r() * 90, 36 + r() * 16); }
    });
    g.strokeStyle = 'rgba(60,60,70,.35)'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 205); g.bezierCurveTo(60, 180, 120, 215, 160, 190); g.stroke();
    return tex(c);
  }
  out.art = [
    art(11, '#f4efe6', ['#9bb8d3', '#d9a07a', '#a9c4a0']),
    art(12, '#eef3f6', ['#e8c27a', '#7fa6c9', '#c9d6b8']),
    art(13, '#f7f1ea', ['#c9774f', '#a6c1a0', '#d8cfc0']),
    art(14, '#edf1ee', ['#8fb2d6', '#e5b98a', '#9cb88f']),
  ];

  /* ---------- mini whiteboard doodles (easel boards) ---------- */
  {
    const [c, g] = mk(256, 180);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 180);
    g.lineWidth = 4; g.lineCap = 'round';
    g.strokeStyle = '#3d7be0'; g.beginPath(); g.moveTo(24, 40); g.bezierCurveTo(70, 10, 110, 60, 160, 28); g.stroke();
    g.strokeStyle = '#e25a4f'; g.strokeRect(30, 70, 70, 44); g.beginPath(); g.moveTo(100, 92); g.lineTo(150, 92); g.lineTo(142, 84); g.moveTo(150, 92); g.lineTo(142, 100); g.stroke();
    g.strokeStyle = '#3fae5a'; g.beginPath(); g.arc(190, 98, 24, 0, 7); g.stroke();
    g.strokeStyle = '#16171b'; g.beginPath(); g.moveTo(30, 140); g.lineTo(100, 140); g.moveTo(30, 156); g.lineTo(160, 156); g.stroke();
    out.easel = tex(c);
  }

  /* ---------- wall TV: dark screen, big number, green line chart + blue bars (classic look) ---------- */
  {
    const [c, g] = mk(512, 288);
    g.fillStyle = '#16181d'; g.fillRect(0, 0, 512, 288);
    g.fillStyle = '#ffffff'; g.font = '700 38px Inter,system-ui,sans-serif'; g.fillText('1,051', 28, 62);
    g.fillStyle = '#7a7f8a'; g.font = '500 16px Inter,system-ui,sans-serif'; g.fillText('visits today', 30, 88);
    g.strokeStyle = '#3ddc84'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    const pts = [0.7, 0.6, 0.65, 0.5, 0.55, 0.4, 0.5, 0.58, 0.35, 0.45, 0.3, 0.38];
    pts.forEach((v, i) => { const x = 28 + (i / (pts.length - 1)) * 300, y = 120 + v * 150; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = '#3b82f6';
    for (let i = 0; i < 9; i++) { const bh = 30 + ((i * 37) % 70); g.fillRect(350 + i * 16, 262 - bh, 10, bh); }
    out.tv = tex(c);
  }

  /* ---------- rack LED panel (animated by props) ---------- */
  {
    const [c, g] = mk(128, 256);
    out.rackCanvas = c; out.rackCtx = g;
    out.rack = tex(c);
  }

  /* ---------- soft round shadow / light pool ---------- */
  {
    const [c, g] = mk(128, 128);
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    out.glow = tex(c);
  }

  return out;
}
