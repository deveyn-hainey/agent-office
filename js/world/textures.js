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
  // wood planks (tile = 8x8 world units)
  function wood(base, seed, plank = 16) {
    const [c, g] = mk(512, 512);
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    const rows = 512 / plank;
    for (let i = 0; i < rows; i++) {
      const y = i * plank;
      g.fillStyle = `rgba(${r() > 0.5 ? '120,80,30' : '255,255,255'},${0.025 + r() * 0.05})`;
      g.fillRect(0, y, 512, plank);
      // plank joints
      let x = r() * 200;
      while (x < 512) { g.fillStyle = 'rgba(70,45,20,.22)'; g.fillRect(x, y, 1.5, plank); x += 140 + r() * 220; }
      g.fillStyle = 'rgba(70,45,20,.2)'; g.fillRect(0, y, 512, 1.5);
    }
    return tex(c, { repeat: true });
  }
  // soft carpet tiles
  function carpet(base, seed) {
    const [c, g] = mk(512, 512);
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '60,60,70'},${0.03 + r() * 0.04})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 3, 2 + r() * 3); }
    g.strokeStyle = 'rgba(60,70,90,.12)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); }
    return tex(c, { repeat: true });
  }
  // lobby tiles
  function tiles(a, b) {
    const [c, g] = mk(512, 512);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * 64, y * 64, 64, 64); }
    g.strokeStyle = 'rgba(120,90,70,.16)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); }
    return tex(c, { repeat: true });
  }
  out.floor = [tiles('#f8ead9', '#f3e2cc'), carpet('#e3ebf2', 11), carpet('#e2eddf', 12), wood('#efe0c4', 13)];

  /* ---------- desk screens ---------- */
  const kw = ['#7ee0a0', '#9cc4ff', '#ffb86b', '#e79cff', '#f2f2f2', '#ffd866', '#7fe3e3'];
  out.code = [0, 1, 2].map((v) => {
    const [c, g] = mk(128, 256);
    const r = rng(100 + v * 17);
    g.fillStyle = '#16202b'; g.fillRect(0, 0, 128, 256);
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
    const gr = g.createLinearGradient(0, 0, 128, 80);
    gr.addColorStop(0, '#dff0ff'); gr.addColorStop(1, '#c9d9f7');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 80);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(10, 10, 50, 5); g.fillRect(10, 20, 36, 4);
    g.fillStyle = 'rgba(80,120,200,.35)'; g.fillRect(70, 14, 44, 44);
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
    g.fillStyle = '#fffdf6'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
    g.fillStyle = '#2b2622';
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
    g.fillStyle = '#2e4a3f'; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.setLineDash([8, 5]); g.strokeRect(8, 8, 240, 144);
    g.setLineDash([]);
    g.fillStyle = '#fff6d8'; g.font = 'bold 30px "Segoe Print","Bradley Hand","Comic Sans MS",cursive'; g.textAlign = 'center';
    g.fillText('Coffee Bar', 128, 46);
    g.font = '19px "Segoe Print","Bradley Hand","Comic Sans MS",cursive'; g.textAlign = 'left'; g.fillStyle = '#e9f2ff';
    g.fillText('espresso', 26, 78); g.fillText('latte', 26, 104); g.fillText('cold brew', 26, 130);
    g.textAlign = 'right'; g.fillStyle = '#ffd37a';
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
    g.fillStyle = '#2b2622'; g.font = 'bold 15px Georgia,serif'; g.textAlign = 'center';
    g.fillText(title, 80, 24);
    g.fillStyle = 'rgba(43,38,34,.55)'; g.fillRect(34, 200, 92, 4);
    return tex(c);
  }
  out.posters = [
    poster(1, '#fdf1dc', '#f5a3b5', '#9bd0f0', '#f6d66b', 'GAME DAY'),
    poster(2, '#e6f1ff', '#ffb36b', '#b9e0a8', '#8fa6f2', 'ODDS'),
    poster(3, '#fff0f4', '#a98be0', '#f7c3d0', '#7ccfb0', 'PITCHSIDE'),
    poster(4, '#f1f7e6', '#6bbf8a', '#ffd776', '#e88a7a', 'SHIP IT'),
  ];

  /* ---------- mini whiteboard doodles (easel boards) ---------- */
  {
    const [c, g] = mk(256, 180);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 180);
    g.lineWidth = 4; g.lineCap = 'round';
    g.strokeStyle = '#3d7be0'; g.beginPath(); g.moveTo(24, 40); g.bezierCurveTo(70, 10, 110, 60, 160, 28); g.stroke();
    g.strokeStyle = '#e25a4f'; g.strokeRect(30, 70, 70, 44); g.beginPath(); g.moveTo(100, 92); g.lineTo(150, 92); g.lineTo(142, 84); g.moveTo(150, 92); g.lineTo(142, 100); g.stroke();
    g.strokeStyle = '#3fae5a'; g.beginPath(); g.arc(190, 98, 24, 0, 7); g.stroke();
    g.strokeStyle = '#2b2622'; g.beginPath(); g.moveTo(30, 140); g.lineTo(100, 140); g.moveTo(30, 156); g.lineTo(160, 156); g.stroke();
    out.easel = tex(c);
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
