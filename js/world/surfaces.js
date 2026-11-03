// S1 — wall surfaces (boards, screens, TVs): framed 3D quads with live CanvasTexture faces.
// createSurfaces({THREE,bus,clock,defs,floorGroups,lineMat,team,getState}) -> {pickables, group(id), render(id,state,meta), tick(dt,simT), reset()}
// State shapes: docs/ARCHITECTURE.md 5.1 (+ whiteboard `columns:[{title,owner?,items:[{sev?,text}]}]`).
import { hash, denverHM, PALETTE } from '../core/util.js';

const INK = '#2b2622';
const GREEN = '#3fae5a', YEL = '#f2b632', RED = '#e25a4f', GREY = '#a49d90', BLUE = '#4c8dff';
const YOU = '#e8553d';
const HAND = '"Segoe Print","Bradley Hand","Chalkboard SE","Comic Sans MS","Marker Felt",cursive';
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const SERIF = 'Georgia,"Iowan Old Style",serif';
const TAU = Math.PI * 2;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = (t) => { t = clamp01(t); const s = 2.2; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v == null ? '' : String(v));

/* ---------------------------------------------------------------- canvas helpers */
function rrPath(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function box(c, x, y, w, h, r, fill, stroke, lw = 2) {
  rrPath(c, x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function font(c, wt, size, fam) { c.font = `${wt} ${Math.max(6, Math.round(size))}px ${fam}`; }
function ellip(c, s, maxW) {
  s = str(s);
  if (c.measureText(s).width <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (c.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1;
  }
  return s.slice(0, lo).trimEnd() + '…';
}
function wrap(c, text, maxW, maxLines = 99) {
  const words = str(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || c.measureText(t).width <= maxW) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (c.measureText(l + '…').width > maxW && l.length > 1) l = l.slice(0, -1);
    lines[maxLines - 1] = l.trimEnd() + '…';
  }
  return lines.map((l) => ellip(c, l, maxW));
}
// largest font size in [minSize,maxSize] whose wrapped text fits maxH; truncates at minSize.
function fitBlock(c, text, wt, fam, maxW, maxH, maxSize, minSize, lh = 1.2) {
  for (let s = Math.round(maxSize); s >= minSize; s -= 1) {
    font(c, wt, s, fam);
    const lines = wrap(c, text, maxW);
    if (lines.length * s * lh <= maxH) return { size: s, lines, lh };
  }
  const s = Math.round(minSize);
  font(c, wt, s, fam);
  const n = Math.max(1, Math.floor(maxH / (s * lh)));
  return { size: s, lines: wrap(c, text, maxW, n), lh };
}
function drawLines(c, fit, x, y, color, align = 'left') {
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'top';
  font(c, c.__wt || 'bold', fit.size, c.__fam || SANS);
  fit.lines.forEach((l, i) => c.fillText(l, x, y + i * fit.size * fit.lh));
  c.textAlign = 'left';
}
function chip(c, text, x, y, h, fill, fg, size, fam = SANS, wt = 'bold', stroke = null) {
  font(c, wt, size, fam);
  const w = c.measureText(text).width + h * 0.7;
  box(c, x, y, w, h, h * 0.35, fill, stroke, 1.5);
  c.fillStyle = fg; c.textBaseline = 'middle'; c.textAlign = 'center';
  c.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
  c.textAlign = 'left'; c.textBaseline = 'top';
  return w;
}
function circle(c, x, y, r, fill, stroke, lw = 2) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
// reveal fn() left-to-right with a marker-tip dot at the edge
function wipe(c, x, y, w, h, p, dot, fn) {
  if (p >= 1) { fn(); return; }
  if (p <= 0.001) return;
  c.save(); c.beginPath(); c.rect(x - 8, y - 8, w * p + 8, h + 16); c.clip(); fn(); c.restore();
  const ex = x + w * p, ey = y + h * 0.5 + Math.sin(p * 30) * h * 0.16;
  circle(c, ex, ey, 5, dot || INK, INK, 1.5);
}
function mix(hex, to, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function polyPartial(c, pts, f) {
  if (f <= 0) return null;
  let tot = 0; const L = [0];
  for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
  const target = tot * f;
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  let last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    if (L[i] <= target) { c.lineTo(pts[i][0], pts[i][1]); last = pts[i]; }
    else {
      const k = (target - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      last = [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
      c.lineTo(last[0], last[1]); break;
    }
  }
  c.stroke();
  return last;
}
function quad(out, x0, y0, cx, cy, x1, y1, n = 10) {
  for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]); }
}
function plaquePts(hw, hh) {
  const r = hh * 0.22; const p = [[-hw, -hh + r]];
  quad(p, -hw, -hh + r, -hw, -hh, -hw + r, -hh);
  p.push([hw - r, -hh]);
  quad(p, hw - r, -hh, hw, -hh, hw, -hh + r);
  p.push([hw, hh * 0.25]);
  quad(p, hw, hh * 0.25, hw, hh * 0.75, 0, hh, 14);
  quad(p, 0, hh, -hw, hh * 0.75, -hw, hh * 0.25, 14);
  p.push([-hw, -hh + r]);
  return p;
}
function circlePts(cx, cy, r, n = 48) { const p = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * TAU; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }
function starPts(cx, cy, R) { const p = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i % 10) * Math.PI / 5; const r = i % 2 ? R * 0.45 : R; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }

/* ---------------------------------------------------------------- frames */
const SPEC = {
  whiteboard: { bw: 0.14, color: '#c9ced6', depth: 0.18, back: '#ffffff' },
  voteboard: { bw: 0.2, color: '#a9743f', depth: 0.2, back: '#fff8e8' },
  jira: { bw: 0.08, color: '#3b3f48', depth: 0.14, back: '#f4f5f7' },
  ciwall: { bw: 0.28, color: '#20242c', depth: 0.24, back: '#1b2430' },
  xray: { bw: 0.2, color: '#262b34', depth: 0.2, back: '#10202a' },
  slack: { bw: 0.2, color: '#1e1f24', depth: 0.2, back: '#ffffff' },
  mural: { bw: 0, color: '#f3efe6', depth: 0.08, back: '#fdfcf8' },
  confscreen: { bw: 0.2, color: '#23262d', depth: 0.2, back: '#171b26' },
  corkboard: { bw: 0.16, color: '#9a6a3a', depth: 0.16, back: '#c99a5b' },
};

export function createSurfaces({ THREE, bus, clock, defs, floorGroups, lineMat, team, getState }) {
  const surfs = new Map();
  const pickables = [];

  /* ---- team lookup */
  const agentKey = new Map();
  for (const a of arr(team?.agents)) {
    for (const k of [a.id, a.name, a.short]) if (k) agentKey.set(String(k).toLowerCase(), a);
  }
  const whoInfo = (w) => {
    const k = str(w).toLowerCase().trim();
    const a = agentKey.get(k);
    if (a) return { name: a.short || a.name || a.id, color: a.color || PALETTE[hash(a.id) % PALETTE.length], agent: a };
    if (k === 'you' || k === 'human' || k === (team?.human?.id || 'you')) return { name: 'You', color: YOU };
    return { name: str(w) || '?', color: PALETTE[hash(k) % PALETTE.length] };
  };

  /* ---- timeline: sim time, but keep polishing animations alive while paused */
  let T = clock?.t || 0;
  let lastPerf = (typeof performance !== 'undefined' ? performance.now() : 0);
  const advance = (dt) => {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const real = Math.min(0.1, Math.max(0, (now - lastPerf) / 1000));
    lastPerf = now;
    T += clock?.paused ? real : dt;
  };
  const prog = (S, key, dur) => {
    const t0 = S.seen.get(key);
    if (t0 === undefined) return 1;
    const p = (T - t0) / dur;
    if (p >= 1) return 1;
    S.animating = true;
    return p < 0 ? 0 : p;
  };

  /* ---- frame builder (merges boxes per colour, one merged edge LineSegments) */
  function mergeGeos(geos) {
    const pos = [], nor = [], idx = []; let off = 0;
    for (const g of geos) {
      const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
      off += p.length / 3;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    m.setIndex(idx);
    return m;
  }
  function builder() {
    const parts = new Map(); const lines = [];
    return {
      box(w, h, d, x, y, z, color, edge = true) {
        const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
        if (!parts.has(color)) parts.set(color, []);
        parts.get(color).push(g);
        if (edge) { const e = new THREE.EdgesGeometry(g).attributes.position.array; for (let i = 0; i < e.length; i++) lines.push(e[i]); }
      },
      build(group) {
        for (const [color, geos] of parts) group.add(new THREE.Mesh(mergeGeos(geos), new THREE.MeshLambertMaterial({ color })));
        if (lines.length) {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
          group.add(new THREE.LineSegments(g, lineMat));
        }
      },
    };
  }

  /* ---------------------------------------------------------------- per-kind: keys of items (for write-in animation) */
  const KEYS = {
    whiteboard(st) {
      const k = [];
      arr(st.requests).forEach((r, i) => k.push(`req:${i}:${str(r?.who)}:${str(r?.text)}`));
      arr(st.steps).forEach((s) => k.push(`step:${s?.n}:${str(s?.text)}`));
      arr(st.cards).forEach((c, i) => k.push(`card:${c?.id ?? i}`));
      arr(st.notes).forEach((n, i) => k.push(`note:${i}:${str(n)}`));
      arr(st.columns).forEach((col, ci) => arr(col?.items).forEach((it, ii) => k.push(`col:${ci}:${ii}:${str(it?.text)}`)));
      return k;
    },
    voteboard(st) {
      const k = [];
      for (const p of arr(st.proposals)) {
        k.push(`prop:${p?.id}`);
        const vs = Object.values(p?.votes || {});
        const y = Math.min(24, Math.max(+p?.yes || 0, vs.filter((v) => v === 'yes').length));
        const n = Math.min(24, Math.max(+p?.no || 0, vs.filter((v) => v === 'no').length));
        for (let i = 0; i < y; i++) k.push(`pip:${p.id}:y:${i}`);
        for (let i = 0; i < n; i++) k.push(`pip:${p.id}:n:${i}`);
        if (p?.locked) k.push(`lock:${p.id}`);
      }
      return k;
    },
    jira: (st) => arr(st.cards).map((c, i) => `card:${c?.key ?? i}`),
    ciwall(st) {
      const k = [];
      arr(st.jobs).forEach((j) => { k.push(`job:${j?.name}`); if (j?.status === 'fail') k.push(`fail:${j.name}`); });
      return k;
    },
    xray: (st) => arr(st.nodes).map((n) => `node:${n?.id}`),
    slack: (st) => arr(st.messages).map((m, i) => `msg:${i}:${str(m?.who)}:${str(m?.ts)}:${str(m?.text)}`),
    mural(st) {
      const b = badgeOf(st);
      return b ? [`badge:${b.text}|${b.color || ''}`] : [];
    },
    confscreen: (st) => arr(st.findings).map((f, i) => `f:${i}:${str(f?.text)}`),
    corkboard(st) {
      return [...arr(st.notes).map((n, i) => `note:${i}:${str(n?.text)}`), ...arr(st.strings).map((s) => `str:${s?.[0]}-${s?.[1]}`)];
    },
  };
  function badgeOf(st) {
    const b = st?.badge;
    if (!b) return null;
    const o = typeof b === 'string' ? { text: b } : b;
    return o.text ? { text: str(o.text), color: o.color } : null;
  }

  /* ---------------------------------------------------------------- drawers */
  const DRAW = {};

  // ---- WHITEBOARD
  DRAW.whiteboard = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, W, H);
    const pad = W * 0.022;
    const hasCols = arr(st.columns).length > 0;
    const reqs = arr(st.requests), steps = arr(st.steps), cards = arr(st.cards), notes = arr(st.notes);
    const title = st.title || (hasCols ? 'Review findings' : 'Planning board');
    c.textBaseline = 'top';
    font(c, 'bold', H * 0.088, HAND);
    c.fillStyle = '#2f5fd0'; c.fillText(title, pad, pad * 0.5);
    const tw = Math.min(W * 0.6, c.measureText(title).width);
    c.strokeStyle = '#2f5fd0'; c.lineWidth = 3; c.beginPath();
    const uy = pad * 0.5 + H * 0.105;
    for (let x = 0; x <= tw; x += 8) { const y = uy + Math.sin(x * 0.18) * 2; x ? c.lineTo(pad + x, y) : c.moveTo(pad, y); }
    c.stroke();
    if (!hasCols && !reqs.length && !steps.length && !cards.length && !notes.length) {
      font(c, 'italic', H * 0.055, HAND); c.fillStyle = '#b9b5a8';
      c.fillText('no requests yet', pad, H * 0.2);
      // faint doodle: sticky outline
      c.setLineDash([8, 8]); c.strokeStyle = '#d9d5c8'; c.lineWidth = 2;
      c.strokeRect(pad, H * 0.32, W * 0.22, H * 0.4); c.setLineDash([]);
      return;
    }
    const top = H * 0.16, bottom = H - pad;
    // ---- columns mode
    if (hasCols) {
      const cardsH = cards.length ? H * 0.2 : 0;
      drawColumns(S, c, pad, top, W - pad * 2, bottom - top - (cardsH ? cardsH + pad * 0.6 : 0), arr(st.columns));
      if (cardsH) drawCards(S, c, pad, bottom - cardsH, W - pad * 2, cardsH, cards);
      return;
    }
    // ---- requests (left)
    const hasRight = steps.length || cards.length || notes.length;
    const leftW = reqs.length ? (hasRight ? W * 0.33 : W * 0.5) : 0;
    if (reqs.length) drawRequests(S, c, pad, top, leftW, bottom - top, reqs);
    const rx = reqs.length ? pad + leftW + W * 0.025 : pad, rw = W - pad - rx;
    let availH = bottom - top;
    // notes strip
    if (notes.length) {
      const nh = H * 0.1;
      availH -= nh;
      font(c, 'bold', H * 0.044, HAND);
      notes.slice(0, 2).forEach((n, i) => {
        const key = `note:${i}:${str(n)}`;
        const p = prog(S, key, 1.1);
        const txt = '* ' + ellip(c, str(n), rw - 30);
        const w = c.measureText(txt).width;
        wipe(c, rx, bottom - nh + i * H * 0.05, w, H * 0.05, p, RED, () => { c.fillStyle = '#c93a2f'; c.textBaseline = 'top'; c.fillText(txt, rx, bottom - nh + i * H * 0.05); });
      });
    }
    let stepsH = 0, cardsH = 0;
    if (steps.length && cards.length) { stepsH = availH * 0.46; cardsH = availH - stepsH - H * 0.02; }
    else if (steps.length) stepsH = availH; else if (cards.length) cardsH = availH;
    if (steps.length) drawSteps(S, c, rx, top, rw, stepsH, steps);
    if (cards.length) drawCards(S, c, rx, top + availH - cardsH, rw, cardsH, cards);
  };

  function drawRequests(S, c, x, y, w, h, reqs) {
    const n = reqs.length, shown = n <= 5 ? n : 4, gap = 10;
    const slots = shown + (n > 5 ? 0.45 : 0);
    const ih = Math.min(S.H * 0.3, (h - gap * shown) / slots);
    for (let i = 0; i < shown; i++) {
      const r = reqs[i] || {};
      const by = y + i * (ih + gap);
      const key = `req:${i}:${str(r.who)}:${str(r.text)}`;
      const p = prog(S, key, 1.5);
      const info = whoInfo(r.who);
      const rot = ((hash('rq' + i) % 100) / 100 - 0.5) * 0.045;
      c.save();
      c.translate(x + w / 2, by + ih / 2); c.rotate(rot);
      const lx = -w / 2, ly = -ih / 2;
      // shadow + sticky body
      box(c, lx + 4, ly + 5, w, ih, 4, 'rgba(0,0,0,0.10)');
      box(c, lx, ly, w, ih, 4, '#fff0a0', INK, 2);
      c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(lx + 2, ly + 2, w - 4, ih * 0.1);
      wipe(c, lx, ly, w, ih, p, '#2f5fd0', () => {
        circle(c, lx + 16, ly + ih * 0.15 + 2, 7, info.color, INK, 1.5);
        font(c, 'bold', S.H * 0.034, SANS); c.fillStyle = '#6b5b1e'; c.textBaseline = 'middle';
        c.fillText(ellip(c, info.name, w - 40), lx + 30, ly + ih * 0.15 + 2);
        c.textBaseline = 'top';
        const fit = fitBlock(c, r.text, 'bold', HAND, w - 24, ih * 0.68, S.H * 0.058, S.H * 0.032, 1.15);
        c.__wt = 'bold'; c.__fam = HAND;
        drawLines(c, fit, lx + 12, ly + ih * 0.3, '#2b2622');
      });
      c.restore();
    }
    if (n > 5) {
      font(c, 'bold', S.H * 0.04, HAND); c.fillStyle = '#7a756a'; c.textBaseline = 'top';
      c.fillText(`+${n - shown} more`, x + 8, y + shown * (ih + gap) + 2);
    }
  }

  function drawSteps(S, c, x, y, w, h, steps) {
    const H = S.H, n = steps.length;
    const nCols = n > 5 ? 2 : 1;
    const minLine = H * 0.047;
    const capRows = Math.max(1, Math.floor((h - H * 0.01) / minLine));
    const cap = capRows * nCols;
    const over = n > cap;
    const shown = over ? cap - 1 : n;
    const rows = Math.ceil((over ? cap : n) / nCols);
    const lineH = Math.min(H * 0.082, (h - H * 0.01) / rows);
    const colW = (w - 12 * (nCols - 1)) / nCols;
    const fs = lineH * 0.7;
    for (let i = 0; i <= shown; i++) {
      const col = Math.floor(i / rows), row = i % rows;
      const cx = x + col * (colW + 12), cy = y + row * lineH;
      if (i === shown) {
        if (!over) break;
        font(c, 'bold', fs, HAND); c.fillStyle = '#7a756a'; c.textBaseline = 'middle';
        c.fillText(`+${n - shown} more`, cx + lineH * 0.9, cy + lineH / 2);
        break;
      }
      const s = steps[i] || {};
      const p = prog(S, `step:${s.n}:${str(s.text)}`, 1.1);
      const r = lineH * 0.36;
      font(c, 'bold', fs, HAND);
      const tx = cx + lineH * 0.95, maxW = colW - lineH * 1.0;
      const txt = ellip(c, str(s.text), maxW);
      const tw = Math.min(maxW, c.measureText(txt).width);
      wipe(c, cx, cy, lineH * 0.95 + tw, lineH, p, '#2f5fd0', () => {
        if (s.done) {
          circle(c, cx + r + 2, cy + lineH / 2, r, GREEN, INK, 1.5);
          c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath();
          c.moveTo(cx + r * 0.9 + 2, cy + lineH / 2); c.lineTo(cx + r * 1.4 + 2, cy + lineH / 2 + r * 0.45); c.lineTo(cx + r * 2.0 + 2, cy + lineH / 2 - r * 0.5); c.stroke();
        } else {
          circle(c, cx + r + 2, cy + lineH / 2, r, '#fff', '#2f5fd0', 2.5);
          font(c, 'bold', fs * 0.85, HAND); c.fillStyle = '#2f5fd0'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(str(s.n ?? i + 1), cx + r + 2, cy + lineH / 2 + 1); c.textAlign = 'left';
        }
        font(c, 'bold', fs, HAND); c.textBaseline = 'middle';
        c.fillStyle = s.done ? '#6d8a6d' : '#2b2622';
        c.fillText(txt, tx, cy + lineH / 2 + 1);
        if (s.done) { c.strokeStyle = '#6d8a6d'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(tx, cy + lineH / 2 + 1); c.lineTo(tx + tw, cy + lineH / 2 + 1); c.stroke(); }
      });
    }
    c.textBaseline = 'top';
  }

  const STATUS_COL = { done: GREEN, doing: YEL, working: YEL, 'in-progress': YEL, review: BLUE, blocked: RED, todo: GREY };
  function drawCards(S, c, x, y, w, h, cards) {
    const H = S.H, n = cards.length, gap = 10;
    const cols = n <= 3 ? Math.max(1, n) : n <= 6 ? 3 : 4;
    const minH = H * 0.15;
    const rowsCap = Math.max(1, Math.floor((h + gap) / (minH + gap)));
    const cap = rowsCap * cols;
    const over = n > cap;
    const shown = over ? cap - 1 : n;
    const rows = Math.ceil((over ? cap : n) / cols);
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = Math.min(H * 0.3, (h - gap * (rows - 1)) / rows);
    for (let i = 0; i <= shown; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = x + col * (cw + gap), cy = y + row * (ch + gap);
      if (i === shown) {
        if (!over) break;
        font(c, 'bold', H * 0.042, HAND); c.fillStyle = '#7a756a'; c.textBaseline = 'middle';
        c.fillText(`+${n - shown} more`, cx + 6, cy + ch / 2); c.textBaseline = 'top';
        break;
      }
      const cd = cards[i] || {};
      const p = prog(S, `card:${cd.id ?? i}`, 0.7);
      const info = whoInfo(cd.owner);
      c.save();
      c.globalAlpha = clamp01(p * 1.4);
      c.translate(0, (1 - easeOut(p)) * -16);
      box(c, cx + 3, cy + 4, cw, ch, 8, 'rgba(0,0,0,0.10)');
      box(c, cx, cy, cw, ch, 8, '#ffffff', INK, 2);
      rrPath(c, cx, cy, cw, ch, 8); c.save(); c.clip();
      c.fillStyle = mix(info.color, '#ffffff', 0.86); c.fillRect(cx, cy, cw, ch);
      c.fillStyle = info.color; c.fillRect(cx, cy, Math.max(9, cw * 0.05), ch);
      c.restore();
      rrPath(c, cx, cy, cw, ch, 8); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      const ix = cx + Math.max(9, cw * 0.05) + 8, iw = cw - (ix - cx) - 10;
      // status dot
      circle(c, cx + cw - 14, cy + 14, 6, STATUS_COL[str(cd.status).toLowerCase()] || GREY, INK, 1.5);
      font(c, 'bold', H * 0.044, HAND);
      const chipH = H * 0.05;
      const fit = fitBlock(c, cd.title, 'bold', HAND, iw - 14, ch - chipH - 18, H * 0.052, H * 0.034, 1.12);
      c.__wt = 'bold'; c.__fam = HAND;
      drawLines(c, fit, ix, cy + 8, '#2b2622');
      let bx = ix; const by = cy + ch - chipH - 7;
      if (cd.scope) bx += chip(c, ellip(c, str(cd.scope), iw * 0.5), bx, by, chipH, '#ece6d6', '#4a443b', H * 0.03, MONO, 'bold', INK) + 6;
      if (cd.key) chip(c, str(cd.key), bx, by, chipH, INK, '#f4ecdc', H * 0.03, MONO);
      c.restore();
    }
  }

  const SEV = { high: ['HIGH', RED, '#fff'], med: ['MED', YEL, INK], medium: ['MED', YEL, INK], low: ['LOW', '#b9b3a4', INK] };
  function drawColumns(S, c, x, y, w, h, columns) {
    const H = S.H, n = Math.min(3, columns.length), gap = 14;
    const cw = (w - gap * (n - 1)) / n;
    for (let ci = 0; ci < n; ci++) {
      const col = columns[ci] || {};
      const cx = x + ci * (cw + gap);
      const info = col.owner ? whoInfo(col.owner) : { color: PALETTE[hash(str(col.title)) % PALETTE.length] };
      box(c, cx, y, cw, h, 8, '#ffffff', INK, 2);
      rrPath(c, cx, y, cw, H * 0.085, 8); c.fillStyle = info.color; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      font(c, 'bold', H * 0.056, HAND); c.fillStyle = '#fff'; c.textBaseline = 'middle';
      c.fillText(ellip(c, str(col.title), cw - 24), cx + 12, y + H * 0.0435);
      c.textBaseline = 'top';
      const items = arr(col.items);
      const iy0 = y + H * 0.1, avail = h - H * 0.11;
      const minRow = H * 0.1;
      const cap = Math.max(1, Math.floor(avail / minRow));
      const over = items.length > cap;
      const shown = over ? cap - 1 : items.length;
      const rh = Math.min(H * 0.17, avail / Math.max(1, over ? cap : items.length));
      for (let i = 0; i < shown; i++) {
        const it = items[i] || {};
        const ry = iy0 + i * rh;
        const p = prog(S, `col:${ci}:${i}:${str(it.text)}`, 1.2);
        wipe(c, cx + 6, ry, cw - 12, rh, p, info.color, () => {
          const sv = SEV[str(it.sev).toLowerCase()];
          let tx = cx + 12;
          if (sv) tx += chip(c, sv[0], tx, ry + rh * 0.15, Math.min(H * 0.05, rh * 0.45), sv[1], sv[2], H * 0.03, SANS) + 8;
          const fit = fitBlock(c, it.text, 'bold', HAND, cx + cw - 10 - tx, rh - 4, H * 0.048, H * 0.032, 1.1);
          c.__wt = 'bold'; c.__fam = HAND;
          drawLines(c, fit, tx, ry + Math.max(2, (rh - fit.lines.length * fit.size * fit.lh) / 2), '#2b2622');
          c.strokeStyle = '#e4dfd2'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx + 10, ry + rh - 1); c.lineTo(cx + cw - 10, ry + rh - 1); c.stroke();
        });
      }
      if (over) { font(c, 'bold', H * 0.04, HAND); c.fillStyle = '#7a756a'; c.fillText(`+${items.length - shown} more`, cx + 12, iy0 + shown * rh + 2); }
      if (!items.length) { font(c, 'italic', H * 0.04, HAND); c.fillStyle = '#b9b5a8'; c.fillText('nothing yet', cx + 12, iy0 + 6); }
    }
  }

  // ---- VOTEBOARD
  DRAW.voteboard = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#fff8e8'; c.fillRect(0, 0, W, H);
    const pad = W * 0.03;
    c.textBaseline = 'top';
    font(c, 'bold', H * 0.12, SERIF); c.fillStyle = '#6b4423'; c.fillText('#decisions', pad, pad * 0.45);
    // ballot box icon
    const bx = W - pad - 60, by = pad * 0.5;
    box(c, bx, by + 14, 56, 34, 5, '#d9b27a', INK, 2);
    c.fillStyle = INK; c.fillRect(bx + 12, by + 22, 32, 4);
    box(c, bx + 18, by - 2, 22, 28, 2, '#fff', INK, 1.5);
    const props = arr(st.proposals);
    const top = H * 0.185, bottom = H - pad * 0.7;
    if (!props.length) {
      font(c, 'italic', H * 0.055, SERIF); c.fillStyle = '#b3a183';
      c.fillText('no proposals on the table', pad, top + 12);
      c.setLineDash([8, 8]); c.strokeStyle = '#dccdb0'; c.lineWidth = 2; box(c, pad, top + 60, W - pad * 2, H * 0.3, 10, null, '#dccdb0', 2); c.setLineDash([]);
      return;
    }
    const maxRows = 3;
    const hidden = Math.max(0, props.length - maxRows);
    const list = props.slice(hidden);
    if (hidden) { font(c, 'bold', H * 0.036, SANS); c.fillStyle = '#9a8660'; c.textAlign = 'right'; c.fillText(`+${hidden} earlier`, bx - 14, pad * 0.9 + 6); c.textAlign = 'left'; }
    const gap = 8;
    const rh = Math.min(H * 0.3, (bottom - top - gap * (list.length - 1)) / list.length);
    list.forEach((p, i) => {
      const y = top + i * (rh + gap), x = pad, rw = W - pad * 2;
      const pp = prog(S, `prop:${p.id}`, 0.6);
      c.save(); c.globalAlpha = clamp01(pp * 1.5); c.translate((1 - easeOut(pp)) * -24, 0);
      box(c, x, y, rw, rh, 9, '#fffdf6', INK, 2);
      const idw = chip(c, str(p.id), x + 10, y + 8, H * 0.058, INK, '#f4ecdc', H * 0.04, MONO);
      const tx = x + 10 + idw + 10;
      const lockedNow = !!p.locked;
      const fit = fitBlock(c, p.text, 'bold', SANS, rw - (tx - x) - 12 - (lockedNow ? 130 : 0), rh * 0.5, H * 0.05, H * 0.034, 1.12);
      c.__wt = 'bold'; c.__fam = SANS;
      drawLines(c, fit, tx, y + 8, '#2b2622');
      // tallies
      const votes = p.votes || {};
      const entries = Object.entries(votes);
      const half = (rw - 20) / 2, ty = y + rh - H * 0.075 - 6, tH = H * 0.075;
      [['yes', 'YES', GREEN, 'y'], ['no', 'NO', RED, 'n']].forEach(([k, label, col, ck], side) => {
        const colored = entries.filter(([, v]) => v === k).map(([id]) => whoInfo(id).color);
        const count = Math.min(24, Math.max(+p[k] || 0, colored.length));
        const sx = x + 10 + side * half;
        font(c, 'bold', H * 0.04, SANS); c.fillStyle = col; c.textBaseline = 'middle';
        c.fillText(label, sx, ty + tH / 2);
        const lw = c.measureText(label).width + 10;
        font(c, 'bold', H * 0.082, SANS);
        const numW = c.measureText(String(+p[k] || count)).width;
        const pipsW = half - lw - numW - 26;
        const r = Math.min(8, tH * 0.28), step = r * 2.35;
        const maxPips = Math.max(1, Math.floor(pipsW / step));
        for (let j = 0; j < Math.min(count, maxPips); j++) {
          const pp2 = prog(S, `pip:${p.id}:${ck}:${j}`, 0.45);
          const sc = backOut(pp2);
          const px = sx + lw + r + j * step, py = ty + tH / 2;
          c.save(); c.translate(px, py); c.scale(sc, sc);
          circle(c, 0, 0, r, j < colored.length ? colored[j] : '#d8d1bf', INK, 1.6);
          c.restore();
        }
        font(c, 'bold', H * 0.082, SANS); c.fillStyle = INK; c.textAlign = 'right';
        c.fillText(String(+p[k] || count), sx + half - 22, ty + tH / 2 + 1);
        c.textAlign = 'left';
      });
      // locked stamp
      if (lockedNow) {
        const sp = prog(S, `lock:${p.id}`, 0.45);
        const yes = +p.yes || 0, no = +p.no || 0;
        const col = yes >= no ? '#2e8a47' : '#9c2f2a';
        const sc = 1 + 0.6 * (1 - easeOut(sp));
        c.save();
        c.globalAlpha = clamp01(sp * 2);
        c.translate(x + rw - 80, y + rh * 0.34); c.rotate(-0.13); c.scale(sc, sc);
        font(c, 'bold', H * 0.075, SANS);
        const sw = c.measureText('LOCKED').width + 26, sh = H * 0.1;
        box(c, -sw / 2, -sh / 2, sw, sh, 8, 'rgba(255,255,255,0.7)', col, 4);
        box(c, -sw / 2 + 5, -sh / 2 + 5, sw - 10, sh - 10, 5, null, col, 1.5);
        c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('LOCKED', 0, 2);
        c.restore();
      }
      c.restore();
      c.textAlign = 'left'; c.textBaseline = 'top';
    });
  };

  // ---- JIRA
  const JCOLS = [['todo', 'TO DO', '#dfe3ea', '#4f596b'], ['doing', 'DOING', '#cfe0ff', '#2b5fc9'], ['review', 'REVIEW', '#ffe7b0', '#9a6a05'], ['done', 'DONE', '#cdeccf', '#2a7f42']];
  const colOf = (v) => {
    const s = str(v).toLowerCase().replace(/[\s_-]/g, '');
    if (s === 'doing' || s === 'inprogress' || s === 'wip') return 1;
    if (s === 'review' || s === 'inreview' || s === 'qa') return 2;
    if (s === 'done' || s === 'closed' || s === 'merged') return 3;
    return 0;
  };
  DRAW.jira = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#f4f5f7'; c.fillRect(0, 0, W, H);
    const pad = W * 0.018, gap = 8;
    const cards = arr(st.cards);
    c.textBaseline = 'middle';
    font(c, 'bold', H * 0.07, SANS); c.fillStyle = '#253858';
    c.fillText('Pitchside board', pad, H * 0.058);
    font(c, 'bold', H * 0.04, SANS); c.fillStyle = '#7a869a'; c.textAlign = 'right';
    c.fillText(`${cards.length} issue${cards.length === 1 ? '' : 's'}`, W - pad, H * 0.058); c.textAlign = 'left';
    const cw = (W - pad * 2 - gap * 3) / 4;
    const hy = H * 0.115, hh = H * 0.085;
    const buckets = [[], [], [], []];
    cards.forEach((cd, i) => buckets[colOf(cd?.col)].push([cd || {}, i]));
    const bodyY = hy + hh + gap, bodyH = H - bodyY - pad * 0.6;
    const maxN = Math.max(1, ...buckets.map((b) => b.length));
    const cardH = Math.max(H * 0.115, Math.min(H * 0.2, (bodyH - gap * (maxN - 1)) / maxN));
    const capacity = Math.max(1, Math.floor((bodyH + gap) / (cardH + gap)));
    const pos = S.extra.pos || (S.extra.pos = new Map());
    const live = new Set();
    const moving = [];
    JCOLS.forEach(([, label, tint, ink], ci) => {
      const x = pad + ci * (cw + gap);
      box(c, x, hy, cw, H - hy - pad * 0.6, 8, '#ebecf0');
      rrPath(c, x, hy, cw, hh, 8); c.fillStyle = tint; c.fill();
      font(c, 'bold', H * 0.046, SANS); c.fillStyle = ink; c.textBaseline = 'middle';
      c.fillText(label, x + 12, hy + hh / 2 + 1);
      const lw = c.measureText(label).width;
      const cnt = String(buckets[ci].length);
      font(c, 'bold', H * 0.04, SANS);
      const bw = Math.max(H * 0.06, c.measureText(cnt).width + 14);
      box(c, x + 12 + lw + 10, hy + hh / 2 - H * 0.026, bw, H * 0.052, H * 0.026, '#fff', ink, 1.5);
      c.fillStyle = ink; c.textAlign = 'center'; c.fillText(cnt, x + 12 + lw + 10 + bw / 2, hy + hh / 2 + 1); c.textAlign = 'left';
      const over = buckets[ci].length > capacity;
      const shown = over ? capacity - 1 : buckets[ci].length;
      buckets[ci].slice(0, shown).forEach(([cd, i], k) => {
        const key = str(cd.key ?? i);
        const tx = x + 6, ty = bodyY + k * (cardH + gap);
        let e = pos.get(key);
        if (!e) { e = { tx, ty, fx: tx, fy: ty, t0: -1e9 }; pos.set(key, e); }
        else if (e.tx !== tx || e.ty !== ty) {
          const cur = jpos(e);
          e.fx = cur[0]; e.fy = cur[1]; e.tx = tx; e.ty = ty; e.t0 = clock?.seeking ? -1e9 : T;
        }
        live.add(key);
        const mp = (T - e.t0) / 0.6;
        if (mp < 1) { S.animating = true; moving.push([cd, i, e, cardH, cw - 12]); }
        else drawJiraCard(S, c, cd, i, tx, ty, cw - 12, cardH, 1);
      });
      if (over) { font(c, 'bold', H * 0.04, SANS); c.fillStyle = '#7a869a'; c.textBaseline = 'middle'; c.fillText(`+${buckets[ci].length - shown} more`, x + 12, bodyY + shown * (cardH + gap) + cardH * 0.3); }
      if (!buckets[ci].length) { font(c, 'italic', H * 0.04, SANS); c.fillStyle = '#a5adba'; c.textBaseline = 'middle'; c.fillText('empty', x + 14, bodyY + 18); }
    });
    for (const k of [...pos.keys()]) if (!live.has(k)) pos.delete(k);
    for (const [cd, i, e, ch, w] of moving) { const cur = jpos(e); drawJiraCard(S, c, cd, i, cur[0], cur[1], w, ch, 1, true); }
    c.textBaseline = 'top';
  };
  function jpos(e) { const t = easeInOut((T - e.t0) / 0.6); return [lerp(e.fx, e.tx, t), lerp(e.fy, e.ty, t)]; }
  function drawJiraCard(S, c, cd, i, x, y, w, h, a, lifted) {
    const H = S.H;
    const p = prog(S, `card:${cd.key ?? i}`, 0.7);
    const info = whoInfo(cd.owner);
    c.save();
    c.globalAlpha = clamp01(p * 1.5) * a;
    c.translate(0, (1 - easeOut(p)) * -14);
    box(c, x + 2, y + (lifted ? 6 : 3), w, h, 6, 'rgba(0,0,0,0.12)');
    box(c, x, y, w, h, 6, '#fff', lifted ? INK : '#a5adba', lifted ? 2 : 1.5);
    c.fillStyle = mix(info.color, '#ffffff', 0.15); c.fillRect(x + 1, y + 8, 4, h - 16);
    c.textBaseline = 'middle';
    font(c, 'bold', H * 0.04, MONO); c.fillStyle = '#2b5fc9';
    c.fillText(ellip(c, str(cd.key), w * 0.6), x + 12, y + H * 0.034);
    const r = H * 0.032;
    circle(c, x + w - r - 8, y + r + 6, r, info.color, INK, 1.5);
    font(c, 'bold', r * 1.1, SANS); c.fillStyle = '#fff'; c.textAlign = 'center';
    c.fillText(str(info.name).charAt(0).toUpperCase(), x + w - r - 8, y + r + 7); c.textAlign = 'left';
    c.textBaseline = 'top';
    const fit = fitBlock(c, cd.title, 'bold', SANS, w - 22, h - H * 0.085, H * 0.046, H * 0.034, 1.12);
    c.__wt = 'bold'; c.__fam = SANS;
    drawLines(c, fit, x + 12, y + H * 0.07, '#172b4d');
    c.restore();
  }

  // ---- CI WALL
  const JOB = {
    queued: ['QUEUED', '#8a94a3'], running: ['RUNNING', '#f2b632'], pass: ['PASS', '#3fae5a'], fail: ['FAIL', '#e25a4f'], warn: ['WARN', '#f2b632'],
  };
  const OVERALL = { idle: ['IDLE', '#8a94a3'], running: ['RUNNING', '#f2b632'], fail: ['FAILED', '#e25a4f'], pass: ['PASSED', '#3fae5a'] };
  DRAW.ciwall = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#1b2430'; c.fillRect(0, 0, W, H);
    const pad = W * 0.03;
    const jobs = arr(st.jobs);
    let status = OVERALL[st.status] ? st.status : null;
    if (!status) {
      if (jobs.some((j) => j?.status === 'fail')) status = 'fail';
      else if (jobs.some((j) => j?.status === 'running')) status = 'running';
      else if (jobs.length && jobs.every((j) => j?.status === 'pass' || j?.status === 'warn')) status = 'pass';
      else status = 'idle';
    }
    const [olabel, ocol] = OVERALL[status];
    c.textBaseline = 'middle';
    font(c, 'bold', H * 0.1, SANS); c.fillStyle = '#e8eef7'; c.fillText('CI', pad, H * 0.085);
    const ciw = c.measureText('CI').width;
    font(c, 'bold', H * 0.04, MONO); c.fillStyle = '#7f90a6'; c.fillText('pitchside / main', pad + ciw + 14, H * 0.09);
    // banner
    const pulse = status === 'running' ? 0.75 + 0.25 * Math.sin(T * 6) : 1;
    font(c, 'bold', H * 0.06, SANS);
    const bw = c.measureText(olabel).width + H * 0.14, bh = H * 0.1;
    let bx = W - pad - bw;
    let badgeW = 0;
    if (st.badge) {
      font(c, 'bold', H * 0.04, SANS);
      const t = str(typeof st.badge === 'string' ? st.badge : st.badge.text || 'local CI');
      badgeW = chip(c, t, bx - 14 - (c.measureText(t).width + H * 0.7 * 0.1 * 7), H * 0.035, H * 0.07, 'rgba(244,236,220,0.12)', '#f4ecdc', H * 0.04, SANS, 'bold', '#f4ecdc');
    }
    c.globalAlpha = pulse; box(c, bx, H * 0.035, bw, bh, bh / 2, ocol); c.globalAlpha = 1;
    font(c, 'bold', H * 0.06, SANS); c.fillStyle = status === 'idle' ? '#1b2430' : '#14110e'; c.textAlign = 'center';
    c.fillText(olabel, bx + bw / 2, H * 0.035 + bh / 2 + 1); c.textAlign = 'left';
    S.led = { color: ocol, blink: status === 'running' };
    c.strokeStyle = '#2f3d52'; c.lineWidth = 2; c.beginPath(); c.moveTo(pad, H * 0.17); c.lineTo(W - pad, H * 0.17); c.stroke();
    if (!jobs.length) {
      font(c, 'bold', H * 0.07, SANS); c.fillStyle = '#4b5c73'; c.textAlign = 'center';
      c.fillText('idle', W / 2, H * 0.5);
      font(c, 'bold', H * 0.04, SANS); c.fillText('no jobs queued', W / 2, H * 0.6); c.textAlign = 'left'; c.textBaseline = 'top';
      return;
    }
    const top = H * 0.2, availH = H - top - pad * 0.7;
    const cap = Math.max(1, Math.floor(availH / (H * 0.1)));
    const over = jobs.length > cap, shown = over ? cap - 1 : jobs.length;
    const rh = Math.min(H * 0.145, availH / (over ? cap : jobs.length));
    for (let i = 0; i < shown; i++) {
      const j = jobs[i] || {};
      const stt = JOB[j.status] ? j.status : 'queued';
      const [lab, col] = JOB[stt];
      const p = prog(S, `job:${j.name}`, 0.6);
      let dx = (1 - easeOut(p)) * -40;
      let fp = 1; if (stt === 'fail') { fp = prog(S, `fail:${j.name}`, 0.9); if (fp < 1) dx += Math.sin(T * 60) * 4 * (1 - fp); }
      const y = top + i * rh, h = rh - 6, x = pad + dx;
      c.save(); c.globalAlpha = clamp01(p * 1.5);
      box(c, x, y, W - pad * 2, h, h * 0.2, stt === 'fail' ? '#3d2429' : stt === 'running' ? '#2a3a4f' : '#243142');
      const r = h * 0.3, lx = x + h * 0.55, ly = y + h / 2;
      let la = 1;
      if (stt === 'running') { la = 0.55 + 0.45 * Math.sin(T * 6); circle(c, lx, ly, r * (1.25 + 0.2 * Math.sin(T * 6)), `rgba(242,182,50,${0.25 * la})`); }
      if (stt === 'fail') la = Math.sin(T * 9) > -0.2 ? 1 : 0.45;
      c.globalAlpha *= la;
      circle(c, lx, ly, r, stt === 'queued' ? 'transparent' : col, stt === 'queued' ? '#8a94a3' : null, 3);
      c.globalAlpha = clamp01(p * 1.5);
      c.strokeStyle = '#fff'; c.lineWidth = 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
      if (stt === 'pass') { c.beginPath(); c.moveTo(lx - r * 0.5, ly); c.lineTo(lx - r * 0.1, ly + r * 0.4); c.lineTo(lx + r * 0.55, ly - r * 0.4); c.stroke(); }
      if (stt === 'fail') { c.beginPath(); c.moveTo(lx - r * 0.4, ly - r * 0.4); c.lineTo(lx + r * 0.4, ly + r * 0.4); c.moveTo(lx + r * 0.4, ly - r * 0.4); c.lineTo(lx - r * 0.4, ly + r * 0.4); c.stroke(); }
      if (stt === 'warn') { font(c, 'bold', r * 1.3, SANS); c.fillStyle = '#14110e'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', lx, ly + 1); c.textAlign = 'left'; }
      c.lineCap = 'butt';
      const nx = lx + r + h * 0.4;
      const nameSize = Math.min(H * 0.05, h * 0.4);
      font(c, 'bold', nameSize, MONO); c.fillStyle = '#eef3fa'; c.textBaseline = 'middle';
      const nmW = W * 0.4;
      if (j.note) {
        c.fillText(ellip(c, str(j.name), nmW), nx, y + h * 0.36);
        font(c, 'bold', Math.min(H * 0.034, h * 0.28), SANS); c.fillStyle = stt === 'fail' ? '#ffb4ac' : '#8fa3bd';
        c.fillText(ellip(c, str(j.note), W * 0.52), nx, y + h * 0.74);
      } else c.fillText(ellip(c, str(j.name), W * 0.5), nx, y + h / 2 + 1);
      // right side
      const rx = W - pad * 2 - W * 0.24, rw = W * 0.24;
      if (stt === 'running') {
        const bh2 = h * 0.26, by2 = y + h / 2 - bh2 / 2;
        box(c, rx, by2, rw, bh2, bh2 / 2, '#14202e');
        c.save(); rrPath(c, rx, by2, rw, bh2, bh2 / 2); c.clip();
        const segW = rw * 0.38, u = ((T * 0.9) % 1.5) - 0.38;
        const gx = rx + u * rw;
        c.fillStyle = col; rrPath(c, gx, by2, segW, bh2, bh2 / 2); c.fill();
        c.restore();
        S.animating = true; S.minInterval = 1 / 15;
      } else {
        font(c, 'bold', Math.min(H * 0.046, h * 0.38), SANS); c.fillStyle = col; c.textAlign = 'right';
        c.fillText(lab, rx + rw, y + h / 2 + 1); c.textAlign = 'left';
      }
      if (stt === 'fail') { S.animating = true; S.minInterval = 1 / 15; }
      c.restore();
    }
    if (over) { font(c, 'bold', H * 0.04, SANS); c.fillStyle = '#7f90a6'; c.textBaseline = 'middle'; c.fillText(`+${jobs.length - shown} more jobs`, pad, top + shown * rh + rh * 0.4); }
    c.textBaseline = 'top';
  };

  // ---- X-RAY
  const GROUP_COL = ['#4cc9f0', '#f78c6b', '#9be564', '#f2b632', '#c77dff', '#ff6b9d'];
  DRAW.xray = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#10202a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(120,200,230,0.07)'; c.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const pad = W * 0.03;
    c.textBaseline = 'middle';
    font(c, 'bold', H * 0.08, SANS); c.fillStyle = '#d6f1ff'; c.fillText('Repo X-Ray', pad, H * 0.09);
    font(c, 'bold', H * 0.035, MONO); c.fillStyle = '#4f8aa6'; c.textAlign = 'right';
    const nodes = arr(st.nodes);
    c.fillText(`${nodes.length} modules`, W - pad, H * 0.09); c.textAlign = 'left';
    if (!nodes.length) {
      font(c, 'bold', H * 0.05, MONO); c.fillStyle = '#3c6579'; c.textAlign = 'center';
      c.fillText('scanning... no graph yet', W / 2, H * 0.52); c.textAlign = 'left'; c.textBaseline = 'top';
      return;
    }
    const groups = [];
    nodes.forEach((n) => { const g = str(n?.group); if (!groups.includes(g)) groups.push(g); });
    const area = { x: pad + 20, y: H * 0.2, w: W - pad * 2 - 40, h: H * 0.62 };
    const P = new Map();
    if (groups.length <= 1) {
      const n = nodes.length, cx = area.x + area.w / 2, cy = area.y + area.h / 2;
      nodes.forEach((nd, i) => {
        const a = -Math.PI / 2 + (i / n) * TAU, rf = n > 8 ? (i % 2 ? 0.58 : 1) : 1;
        const jit = ((hash(str(nd.id)) % 100) / 100 - 0.5) * 0.12;
        P.set(nd.id, [cx + Math.cos(a) * area.w * 0.42 * rf * (1 + jit), cy + Math.sin(a) * area.h * 0.42 * rf]);
      });
    } else {
      const cnt = {};
      nodes.forEach((nd) => { const g = str(nd.group); cnt[g] = (cnt[g] || 0) + 1; });
      const seen = {};
      nodes.forEach((nd) => {
        const g = str(nd.group), gi = groups.indexOf(g), k = seen[g] = (seen[g] || 0) + 1, m = cnt[g];
        const colW = area.w / groups.length;
        const jx = ((hash(str(nd.id)) % 100) / 100 - 0.5) * colW * 0.28;
        P.set(nd.id, [area.x + colW * (gi + 0.5) + jx + (k % 2 ? -1 : 1) * colW * 0.08, area.y + area.h * (k - 0.5) / m]);
      });
    }
    const hl = new Set(arr(st.highlight));
    const anyHL = nodes.some((n) => hl.has(n.id));
    const T2 = T;
    // edges
    for (const e of arr(st.edges)) {
      const a = P.get(e?.[0]), b = P.get(e?.[1]);
      if (!a || !b) continue;
      const both = hl.has(e[0]) && hl.has(e[1]);
      const pa = Math.min(prog(S, `node:${e[0]}`, 0.8), prog(S, `node:${e[1]}`, 0.8));
      c.globalAlpha = pa * (anyHL ? (both ? 1 : 0.35) : 0.8);
      c.strokeStyle = both ? '#ffd54a' : '#4a7e96'; c.lineWidth = both ? 4 : 2;
      c.beginPath(); c.moveTo(a[0], a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
      c.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, b[0], b[1]); c.stroke();
    }
    c.globalAlpha = 1;
    const gcol = (g) => GROUP_COL[Math.max(0, groups.indexOf(g)) % GROUP_COL.length];
    const R = H * 0.034;
    nodes.forEach((nd) => {
      const pt = P.get(nd.id); if (!pt) return;
      const p = prog(S, `node:${nd.id}`, 0.8);
      const on = hl.has(nd.id);
      const a = clamp01(p * 1.5) * (anyHL && !on ? 0.45 : 1);
      c.save(); c.globalAlpha = a; c.translate(pt[0], pt[1]); c.scale(backOut(p), backOut(p));
      if (on) {
        const pr = R * (1.7 + 0.3 * Math.sin(T2 * 5));
        circle(c, 0, 0, pr, 'rgba(255,213,74,0.22)', '#ffd54a', 3);
        S.animating = true; S.minInterval = 1 / 20;
      }
      circle(c, 0, 0, R, on ? '#ffd54a' : gcol(str(nd.group)), '#0a141b', 3);
      c.restore();
      c.globalAlpha = a;
      font(c, 'bold', H * 0.034, MONO); c.fillStyle = on ? '#fff3c0' : '#a9d3e6'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(ellip(c, str(nd.label ?? nd.id), 130), pt[0], pt[1] + R + 5);
      c.globalAlpha = 1;
    });
    c.textAlign = 'left';
    // legend
    if (groups.length > 1 || groups[0]) {
      let lx = pad; const ly = H - H * 0.065;
      c.textBaseline = 'middle'; font(c, 'bold', H * 0.034, SANS);
      groups.forEach((g) => {
        circle(c, lx + 8, ly, 7, gcol(g), '#0a141b', 2);
        c.fillStyle = '#9ec7da'; const t = g || 'other'; c.fillText(t, lx + 22, ly + 1);
        lx += 22 + c.measureText(t).width + 26;
      });
    }
    c.textBaseline = 'top';
  };

  // ---- SLACK
  const tsText = (ts) => {
    if (ts == null || ts === '') return '';
    const d = typeof ts === 'number' ? new Date(ts < 1e11 ? ts * 1000 : ts) : new Date(ts);
    return isNaN(d) ? str(ts) : denverHM(d);
  };
  DRAW.slack = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
    const pad = W * 0.025, hh = H * 0.13;
    c.fillStyle = '#4a154b'; c.fillRect(0, 0, W, hh);
    const ch = str(st.channel || 'general').replace(/^#/, '');
    c.textBaseline = 'middle';
    font(c, 'bold', H * 0.07, SANS); c.fillStyle = '#fff';
    c.fillText('# ' + ellip(c, ch, W * 0.7), pad, hh / 2 + 1);
    font(c, 'bold', H * 0.036, SANS); c.fillStyle = '#d9b8dc'; c.textAlign = 'right';
    c.fillText('Pitchside HQ', W - pad, hh / 2 + 1); c.textAlign = 'left';
    const compH = H * 0.1;
    box(c, pad, H - compH - pad * 0.5, W - pad * 2, compH, 8, '#fff', '#b9b4bd', 2);
    font(c, 'normal', H * 0.04, SANS); c.fillStyle = '#9b96a0';
    c.fillText(`Message #${ellip(c, ch, W * 0.5)}`, pad + 16, H - compH / 2 - pad * 0.5 + 1);
    const msgs = arr(st.messages);
    const top = hh + 10, bottom = H - compH - pad * 0.5 - 10;
    if (!msgs.length) {
      font(c, 'italic', H * 0.05, SANS); c.fillStyle = '#b4afb8'; c.textAlign = 'center';
      c.fillText('No messages yet', W / 2, (top + bottom) / 2); c.textAlign = 'left'; c.textBaseline = 'top';
      return;
    }
    const av = H * 0.11, fs = H * 0.046, nameS = H * 0.048, gap = 10;
    font(c, 'normal', fs, SANS);
    const tx = pad + av + 14, tw = W - pad - tx;
    const rows = [];
    let used = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i] || {};
      font(c, 'normal', fs, SANS);
      const lines = wrap(c, m.text, tw, 2);
      const rh = Math.max(av, nameS * 1.3 + lines.length * fs * 1.2) + gap;
      if (used + rh > bottom - top + gap && rows.length) break;
      rows.unshift({ m, i, lines, rh }); used += rh;
    }
    let y = bottom - used + gap;
    c.save(); c.beginPath(); c.rect(0, top, W, bottom - top + 4); c.clip();
    for (const r of rows) {
      const p = prog(S, `msg:${r.i}:${str(r.m.who)}:${str(r.m.ts)}:${str(r.m.text)}`, 0.5);
      const info = whoInfo(r.m.who);
      c.save(); c.globalAlpha = clamp01(p * 1.5); c.translate(0, (1 - easeOut(p)) * 26);
      box(c, pad, y, av, av, av * 0.2, info.color, INK, 2);
      font(c, 'bold', av * 0.5, SANS); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(info.name.charAt(0).toUpperCase(), pad + av / 2, y + av / 2 + 2); c.textAlign = 'left';
      font(c, 'bold', nameS, SANS); c.fillStyle = '#1d1c1d'; c.textBaseline = 'top';
      const nm = ellip(c, info.name, tw * 0.5);
      c.fillText(nm, tx, y - 2);
      const nw = c.measureText(nm).width;
      font(c, 'normal', H * 0.034, SANS); c.fillStyle = '#868086';
      c.fillText(tsText(r.m.ts), tx + nw + 12, y + 3);
      font(c, 'normal', fs, SANS); c.fillStyle = '#2b2a2c';
      r.lines.forEach((l, k) => c.fillText(l, tx, y + nameS * 1.25 + k * fs * 1.2));
      c.restore();
      y += r.rh;
    }
    c.restore();
  };

  // ---- MURAL
  DRAW.mural = (S, ) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#fdfcf8'; c.fillRect(0, 0, W, H);
    c.setLineDash([3, 10]); c.lineCap = 'round'; c.strokeStyle = '#d3cdbf'; c.lineWidth = 3;
    rrPath(c, 20, 20, W - 40, H - 40, 18); c.stroke(); c.setLineDash([]); c.lineCap = 'butt';
    const b = badgeOf(st);
    if (!b) {
      font(c, 'italic', H * 0.04, SANS); c.fillStyle = '#c4beaf'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('blank wall — ask someone to draw', W / 2, H * 0.52); c.textAlign = 'left'; c.textBaseline = 'top';
      return;
    }
    const t0 = S.seen.get(`badge:${b.text}|${b.color || ''}`);
    let p = typeof st.progress === 'number' ? clamp01(st.progress) : (t0 === undefined ? 1 : clamp01((T - t0) / 3));
    if (p < 1 && typeof st.progress !== 'number') S.animating = true;
    const col = b.color || BLUE;
    const hw = Math.min(W * 0.26, H * 0.5), hh = H * 0.4;
    c.save(); c.translate(W / 2, H / 2 + 4);
    const pts = plaquePts(hw, hh);
    c.lineJoin = 'round'; c.lineCap = 'round';
    let tip = null;
    // fill wipe
    const fp = seg(p, 0.42, 0.72);
    if (fp > 0) {
      c.save(); c.beginPath(); c.rect(-hw - 10, -hh - 10, (hw * 2 + 20) * fp, hh * 2 + 20); c.clip();
      c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
      c.fillStyle = col; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-hw, -hh, hw * 2, hh * 0.5);
      c.restore();
      if (fp < 1) tip = [-hw + hw * 2 * fp, 0];
    }
    c.strokeStyle = INK; c.lineWidth = 7;
    const op = seg(p, 0, 0.3);
    if (op > 0) { const l = polyPartial(c, pts, op); if (op < 1) tip = l; }
    const rcy = -hh * 0.38, rr = hh * 0.3;
    const rp = seg(p, 0.22, 0.45);
    c.lineWidth = 6;
    if (rp > 0) { const l = polyPartial(c, circlePts(0, rcy, rr), rp); if (rp < 1) tip = l; c.strokeStyle = rp >= 1 ? '#f4ecdc' : INK; }
    if (rp >= 1) { c.strokeStyle = '#f4ecdc'; c.lineWidth = 4; polyPartial(c, circlePts(0, rcy, rr * 0.82), 1); }
    const sp = seg(p, 0.4, 0.58);
    if (sp > 0) {
      c.strokeStyle = INK; c.lineWidth = 5;
      const sp2 = starPts(0, rcy, rr * 0.62);
      if (seg(p, 0.55, 0.7) > 0) { c.beginPath(); sp2.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.globalAlpha = seg(p, 0.55, 0.7); c.fillStyle = '#ffd54a'; c.fill(); c.globalAlpha = 1; }
      const l = polyPartial(c, sp2, sp); if (sp < 1) tip = l;
    }
    // text
    const tp = seg(p, 0.7, 1);
    const text = b.text.toUpperCase();
    if (tp > 0) {
      const maxW = hw * 1.6;
      let fit = null;
      for (let s = Math.round(H * 0.15); s >= H * 0.06; s -= 2) { font(c, 'bold', s, SANS); const ls = wrap(c, text, maxW, 2); if (ls.length === 1 || s <= H * 0.08) { fit = { size: s, lines: ls }; if (ls.every((l) => c.measureText(l).width <= maxW)) break; } }
      font(c, 'bold', fit.size, SANS);
      let remain = Math.ceil(text.replace(/ /g, '').length * tp);
      const lh = fit.size * 1.12, y0 = hh * 0.2 - ((fit.lines.length - 1) * lh) / 2;
      c.fillStyle = '#fff'; c.textBaseline = 'middle';
      fit.lines.forEach((l, i) => {
        const fw = c.measureText(l).width; let out = '';
        for (const ch of l) { if (ch !== ' ') { if (remain <= 0) break; remain--; } out += ch; }
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 4;
        c.fillText(out, -fw / 2, y0 + i * lh);
        if (tp < 1 && out.length && remain <= 0) tip = [-fw / 2 + c.measureText(out).width + 4, y0 + i * lh];
      });
    }
    if (p < 1 && tip) { circle(c, tip[0], tip[1], 8, '#fff', INK, 3); circle(c, tip[0], tip[1], 3.5, col, null); }
    c.restore();
  };

  // ---- CONF SCREEN
  DRAW.confscreen = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    c.fillStyle = '#171b26'; c.fillRect(0, 0, W, H);
    const pad = W * 0.03;
    const ag = st.agent ? whoInfo(st.agent) : null;
    const accent = ag?.color && ag.color !== '#2f2f35' ? ag.color : (ag ? '#8a93ff' : '#6f7ad9');
    const findings = arr(st.findings);
    c.fillStyle = accent; c.fillRect(0, 0, W, H * 0.025);
    c.fillStyle = accent; c.fillRect(pad, H * 0.06, 7, H * 0.13);
    c.textBaseline = 'top';
    font(c, 'bold', H * 0.085, SANS); c.fillStyle = '#f2f4fa';
    c.fillText(ellip(c, st.title || 'Findings', W - pad * 3), pad + 22, H * 0.055);
    font(c, 'bold', H * 0.04, SANS); c.fillStyle = accent;
    c.fillText(ag ? ag.name : (findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : 'standing by'), pad + 22, H * 0.15);
    S.led = { color: findings.length ? GREEN : '#6b7280', blink: false };
    if (!findings.length) {
      font(c, 'bold', H * 0.055, MONO); c.fillStyle = '#4b5470';
      const msg = 'waiting for findings';
      c.fillText(msg, pad + 22, H * 0.45);
      if (Math.floor(T * 2) % 2 === 0) c.fillRect(pad + 22 + c.measureText(msg).width + 8, H * 0.45, 14, H * 0.06);
      S.animating = true; S.minInterval = 0.25;
      return;
    }
    const top = H * 0.25, availH = H - top - pad * 0.6;
    const cap = Math.max(1, Math.floor(availH / (H * 0.13)));
    const over = findings.length > cap, shown = over ? cap - 1 : findings.length;
    const rh = Math.min(H * 0.19, availH / (over ? cap : findings.length));
    for (let i = 0; i < shown; i++) {
      const f = findings[i] || {};
      const y = top + i * rh, h = rh - 7;
      const p = prog(S, `f:${i}:${str(f.text)}`, 1.1);
      wipe(c, pad, y, W - pad * 2, h, p, accent, () => {
        box(c, pad, y, W - pad * 2, h, 8, '#232a3a');
        const sv = SEV[str(f.sev).toLowerCase()] || SEV.low;
        const cw = chip(c, sv[0], pad + 12, y + h * 0.5 - H * 0.03, H * 0.06, sv[1], sv[2], H * 0.037, SANS);
        const tx = pad + 12 + cw + 14;
        const fit = fitBlock(c, f.text, 'bold', SANS, W - pad - tx - 12, f.file ? h * 0.62 : h - 8, H * 0.05, H * 0.034, 1.12);
        c.__wt = 'bold'; c.__fam = SANS;
        const blockH = fit.lines.length * fit.size * fit.lh + (f.file ? H * 0.04 : 0);
        const by = y + (h - blockH) / 2;
        drawLines(c, fit, tx, by, '#eef1fa');
        if (f.file) { font(c, 'bold', H * 0.032, MONO); c.fillStyle = '#7f93c4'; c.textBaseline = 'top'; c.fillText(ellip(c, str(f.file), W - pad - tx - 12), tx, by + fit.lines.length * fit.size * fit.lh + 2); }
      });
    }
    if (over) { font(c, 'bold', H * 0.04, SANS); c.fillStyle = '#7f93c4'; c.fillText(`+${findings.length - shown} more`, pad + 12, top + shown * rh + 4); }
  };

  // ---- CORKBOARD
  const NOTE_COL = ['#fff3a8', '#ffd1dc', '#cfe8ff', '#d6f5d6', '#ffe0b3'];
  DRAW.corkboard = (S) => {
    const c = S.ctx, W = S.W, H = S.H, st = S.state;
    if (!S.extra.bg) {
      const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
      const b = bg.getContext('2d'); const R = rng(hash(S.id));
      b.fillStyle = '#c99a5b'; b.fillRect(0, 0, W, H);
      for (let i = 0; i < W * H / 120; i++) {
        const t = R(); b.fillStyle = t < 0.4 ? 'rgba(120,80,40,0.35)' : t < 0.7 ? 'rgba(235,200,140,0.5)' : 'rgba(80,50,25,0.25)';
        b.beginPath(); b.arc(R() * W, R() * H, 0.8 + R() * 2.2, 0, TAU); b.fill();
      }
      S.extra.bg = bg;
    }
    c.drawImage(S.extra.bg, 0, 0);
    const notes = arr(st.notes);
    if (!notes.length) {
      font(c, 'italic', H * 0.06, HAND); c.fillStyle = 'rgba(70,40,15,0.55)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('evidence board — nothing pinned yet', W / 2, H / 2); c.textAlign = 'left'; c.textBaseline = 'top';
      return;
    }
    const n = notes.length, pad = W * 0.035;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * W / H * 0.8)));
    const rows = Math.ceil(n / cols);
    const cw = (W - pad * 2) / cols, chh = (H - pad * 2) / rows;
    const nw = Math.min(cw * 0.84, 210), nh = Math.min(chh * 0.8, 130);
    const centers = notes.map((nt, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const jx = ((hash('cx' + i) % 100) / 100 - 0.5) * cw * 0.1, jy = ((hash('cy' + i) % 100) / 100 - 0.5) * chh * 0.1;
      const cx = typeof nt?.x === 'number' ? pad + nt.x * (W - pad * 2) : pad + cw * (col + 0.5) + jx;
      const cy = typeof nt?.y === 'number' ? pad + nt.y * (H - pad * 2) : pad + chh * (row + 0.5) + jy;
      return [cx, cy];
    });
    const rots = notes.map((_, i) => ((hash('r' + i) % 100) / 100 - 0.5) * 0.16);
    const pp = notes.map((nt, i) => prog(S, `note:${i}:${str(nt?.text)}`, 0.5));
    notes.forEach((nt, i) => {
      const [cx, cy] = centers[i], p = pp[i];
      c.save(); c.globalAlpha = clamp01(p * 1.6); c.translate(cx, cy); c.rotate(rots[i]); const sc = 1 + 0.3 * (1 - easeOut(p)); c.scale(sc, sc);
      box(c, -nw / 2 + 4, -nh / 2 + 6, nw, nh, 3, 'rgba(60,35,10,0.28)');
      box(c, -nw / 2, -nh / 2, nw, nh, 3, NOTE_COL[hash('n' + i) % NOTE_COL.length], INK, 2);
      const fit = fitBlock(c, nt?.text, 'bold', HAND, nw - 22, nh - 30, H * 0.07, H * 0.034, 1.12);
      c.__wt = 'bold'; c.__fam = HAND;
      drawLines(c, fit, -nw / 2 + 11, -nh / 2 + 20, '#2b2622');
      c.restore();
    });
    // strings
    const pin = (i) => { const [cx, cy] = centers[i]; const r = rots[i], d = -nh / 2 + 9; return [cx - d * Math.sin(r), cy + d * Math.cos(r)]; };
    c.strokeStyle = '#c0392b'; c.lineWidth = 3.5; c.lineCap = 'round';
    for (const s of arr(st.strings)) {
      const i = s?.[0], j = s?.[1];
      if (!centers[i] || !centers[j] || i === j) continue;
      const a = pin(i), b = pin(j), p = prog(S, `str:${i}-${j}`, 0.6);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + 14 + Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.06;
      c.beginPath(); c.moveTo(a[0], a[1]);
      const N = 18;
      const tmax = p;
      for (let k = 1; k <= N; k++) {
        const t = (k / N) * tmax, u = 1 - t;
        c.lineTo(u * u * a[0] + 2 * u * t * mx + t * t * b[0], u * u * a[1] + 2 * u * t * my + t * t * b[1]);
      }
      c.stroke();
    }
    c.lineCap = 'butt';
    notes.forEach((_, i) => {
      const [px, py] = pin(i); const a = clamp01(pp[i] * 2);
      c.globalAlpha = a; circle(c, px + 1.5, py + 2.5, 7, 'rgba(0,0,0,0.3)');
      circle(c, px, py, 7, ['#e25a4f', '#4c8dff', '#f2b632'][i % 3], INK, 2); circle(c, px - 2, py - 2, 2, 'rgba(255,255,255,0.8)');
      c.globalAlpha = 1;
    });
  };

  /* ---------------------------------------------------------------- build surfaces */
  function frameDressing(kind, w, h, sp, b, S, group) {
    const z0 = -0.03, front = z0 + sp.depth;
    const led = (x, y, color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, front + 0.02); group.add(m); S.ledMesh = m;
    };
    if (kind === 'whiteboard') {
      b.box(w * 0.5, 0.07, 0.24, 0, -h / 2 + 0.02, front + 0.08, '#aeb4be');
      const cols = ['#2f5fd0', '#e25a4f', '#3fae5a', '#2b2622'];
      cols.forEach((col, i) => {
        b.box(0.34, 0.07, 0.07, -w * 0.18 + i * 0.5, -h / 2 + 0.095, front + 0.1, col);
        b.box(0.09, 0.075, 0.075, -w * 0.18 + i * 0.5 + 0.17, -h / 2 + 0.096, front + 0.1, '#f4ecdc', false);
      });
      b.box(0.42, 0.1, 0.14, w * 0.18, -h / 2 + 0.11, front + 0.1, '#e7e1d2');
      b.box(0.42, 0.04, 0.14, w * 0.18, -h / 2 + 0.07, front + 0.1, '#3b3f48');
    } else if (kind === 'slack') {
      b.box(w * 0.55, 0.1, 0.5, 0, -h / 2 - 0.2, 0.2, '#b98a58');
      b.box(0.12, 0.2, 0.12, -w * 0.2, -h / 2 - 0.08, 0.05, '#3b3f48');
      b.box(0.12, 0.2, 0.12, w * 0.2, -h / 2 - 0.08, 0.05, '#3b3f48');
      b.box(0.35, 0.28, 0.2, w * 0.28, -h / 2 - 0.05, 0.3, '#e25a4f');
      led(w / 2 - 0.4, -h / 2 + 0.1, '#3fae5a');
    } else if (kind === 'ciwall') {
      led(w / 2 - 0.5, -h / 2 + 0.14, '#8a94a3');
      b.box(0.5, 0.05, 0.03, -w / 2 + 0.7, -h / 2 + 0.14, front + 0.015, '#3b4250', false);
    } else if (kind === 'xray') {
      led(w / 2 - 0.4, -h / 2 + 0.1, '#4cc9f0');
    } else if (kind === 'confscreen') {
      led(w / 2 - 0.4, -h / 2 + 0.1, '#6b7280');
      b.box(0.5, 0.05, 0.03, 0, -h / 2 + 0.1, front + 0.015, '#3b4250', false);
    } else if (kind === 'voteboard') {
      b.box(0.5, 0.2, 0.06, 0, h / 2 - 0.1, front + 0.02, '#e0b97e', false);
    } else if (kind === 'corkboard') {
      b.box(w * 0.3, 0.05, 0.08, 0, -h / 2 + 0.05, front + 0.03, '#7d5429', false);
    }
  }

  for (const def of arr(defs)) {
    const kind = def.kind;
    if (!DRAW[kind]) { console.warn('[surfaces] unknown kind', kind, def.id); continue; }
    const sp = SPEC[kind];
    const fg = floorGroups?.[def.floor];
    if (!fg) { console.warn('[surfaces] no floor group', def.floor); continue; }
    const group = new THREE.Group();
    group.name = 'surface:' + def.id;
    group.position.set(def.x, def.y, def.z);
    group.rotation.y = def.rot || 0;
    group.userData.pick = { type: 'surface', id: def.id, kind, floor: def.floor };
    const w = def.w, h = def.h, bw = sp.bw;
    const iw = w - 2 * bw, ih = h - 2 * bw;
    const b = builder();
    const z0 = -0.03;
    let faceZ;
    if (bw > 0) {
      const mid = z0 + sp.depth / 2;
      b.box(w, bw, sp.depth, 0, h / 2 - bw / 2, mid, sp.color);
      b.box(w, bw, sp.depth, 0, -h / 2 + bw / 2, mid, sp.color);
      b.box(bw, ih, sp.depth, -w / 2 + bw / 2, 0, mid, sp.color);
      b.box(bw, ih, sp.depth, w / 2 - bw / 2, 0, mid, sp.color);
      b.box(iw + 0.02, ih + 0.02, sp.depth * 0.5, 0, 0, z0 + sp.depth * 0.25, sp.back, false);
      faceZ = z0 + sp.depth * 0.5 + 0.004;
    } else {
      b.box(w, h, sp.depth, 0, 0, z0 + sp.depth / 2, sp.color);
      faceZ = z0 + sp.depth + 0.004;
    }
    const cw = Math.max(64, Math.round(iw * 100)), chh = Math.max(64, Math.round(ih * 100));
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = chh;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.set(0, 0, faceZ);
    const S = { id: def.id, def, kind, group, canvas, ctx, tex, W: cw, H: chh, state: {}, meta: {}, seen: new Map(), extra: {}, dirty: true, animating: false, minInterval: 0, lastDraw: -1, warned: false, led: null, ledMesh: null };
    frameDressing(kind, w, h, sp, b, S, group);
    b.build(group);
    group.add(face);
    fg.add(group);
    surfs.set(def.id, S);
    pickables.push(group);
  }

  function redraw(S) {
    S.animating = false; S.minInterval = 0; S.dirty = false; S.lastDraw = T;
    const c = S.ctx;
    try {
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.setLineDash([]); c.textAlign = 'left'; c.textBaseline = 'top';
      c.clearRect(0, 0, S.W, S.H);
      DRAW[S.kind](S);
    } catch (e) {
      if (!S.warned) { S.warned = true; console.warn('[surfaces] draw failed for', S.id, e); }
      S.animating = false;
    }
    S.tex.needsUpdate = true;
    if (S.ledMesh && S.led) S.ledMesh.material.color.set(S.led.color);
  }

  function render(id, state, meta) {
    const S = surfs.get(id);
    if (!S) return;
    S.state = state && typeof state === 'object' ? state : {};
    S.meta = meta || {};
    try {
      const keys = KEYS[S.kind](S.state);
      const next = new Map();
      for (const k of keys) next.set(k, S.seen.has(k) ? S.seen.get(k) : (clock?.seeking ? -1e9 : T));
      S.seen = next;
    } catch (e) { if (!S.warned) { S.warned = true; console.warn('[surfaces] keys failed for', id, e); } }
    S.dirty = true;
  }

  let blinkAcc = 0;
  function tick(dt) {
    advance(dt || 0);
    blinkAcc += dt || 0;
    for (const S of surfs.values()) {
      if (S.dirty || (S.animating && T - S.lastDraw >= S.minInterval && T !== S.lastDraw)) redraw(S);
      if (S.ledMesh && S.led?.blink) S.ledMesh.visible = Math.sin(T * 7) > -0.3;
      else if (S.ledMesh && !S.ledMesh.visible) S.ledMesh.visible = true;
    }
  }

  function reset() {
    for (const S of surfs.values()) {
      S.state = {}; S.seen = new Map(); S.extra.pos = null; S.dirty = true; S.led = null;
    }
  }

  return { pickables, group: (id) => surfs.get(id)?.group || null, render, tick, reset };
}
