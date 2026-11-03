// Small DOM helpers shared by the UI modules.
import { esc } from '../core/util.js';

export const $ = (id) => document.getElementById(id);

// tiny hyperscript: h('div.card#id', {onclick}, ...children)
export function h(sel, props, ...kids) {
  const m = /^([a-z0-9]*)((?:[.#][\w-]+)*)/i.exec(sel);
  const el = document.createElement(m[1] || 'div');
  for (const t of m[2].match(/[.#][\w-]+/g) || []) t[0] === '.' ? el.classList.add(t.slice(1)) : (el.id = t.slice(1));
  if (props && (props.nodeType || typeof props === 'string' || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

export const initials = (a) => {
  const n = (a.short || a.name || a.id || '?').replace(/\(.*?\)/g, '').trim();
  const parts = n.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)).toUpperCase();
};

export function isDark(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

// round avatar chip with initials (optionally a status ring colour)
export function avatarHTML(a, size = 28, ring = '') {
  const c = a?.color || '#a7acb4';
  return `<span class="av" style="--c:${c};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;${ring ? `--ring:${ring};` : ''}color:${isDark(c) ? '#fff' : '#111'}">${esc(initials(a || { id: '?' }))}</span>`;
}

// status palette for the reskinned UI (green working / orange waiting / red error / grey resting / blue finished)
export const SC = { working: '#3dba5f', waiting: '#f5a431', error: '#ef4f4f', resting: '#a7acb4', finished: '#3b82f6' };

// big glossy bot blob (svg) for the desk card
export function meepleSVG(color, state = 'working') {
  const eyes = state === 'resting'
    ? '<path d="M36 46q4 3 8 0M56 46q4 3 8 0" stroke="#111" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    : '<circle cx="40" cy="46" r="3.4" fill="#111"/><circle cx="60" cy="46" r="3.4" fill="#111"/>';
  return `<svg viewBox="0 0 100 110" class="meeple" aria-hidden="true">
  <defs><radialGradient id="bg${color.slice(1)}" cx=".35" cy=".28" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${color}"/></radialGradient></defs>
  <ellipse cx="50" cy="100" rx="30" ry="6" fill="rgba(0,0,0,.10)"/>
  <rect x="42" y="84" width="16" height="12" rx="3" fill="#111"/><rect x="26" y="94" width="48" height="6" rx="3" fill="#111"/>
  <circle cx="50" cy="52" r="38" fill="${color}"/><circle cx="50" cy="52" r="38" fill="url(#bg${color.slice(1)})"/>
  ${eyes}
</svg>`;
}

// keep global shortcuts away from text fields
export function trapKeys(el) {
  el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
}
