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
  const c = a?.color || '#a49d90';
  return `<span class="av" style="--c:${c};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;${ring ? `--ring:${ring};` : ''}color:${isDark(c) ? '#fff' : '#2b2622'}">${esc(initials(a || { id: '?' }))}</span>`;
}

// big meeple portrait (svg) for the desk card
export function meepleSVG(color, state = 'working') {
  const eyes = state === 'resting'
    ? '<path d="M38 36q3 2 6 0M56 36q3 2 6 0" stroke="#2b2622" stroke-width="2" fill="none" stroke-linecap="round"/>'
    : '<circle cx="41" cy="36" r="2.4" fill="#2b2622"/><circle cx="59" cy="36" r="2.4" fill="#2b2622"/>';
  const mouth = state === 'error'
    ? '<path d="M44 48q6-5 12 0" stroke="#2b2622" stroke-width="2" fill="none" stroke-linecap="round"/>'
    : '<path d="M44 44q6 5 12 0" stroke="#2b2622" stroke-width="2" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 110" class="meeple" aria-hidden="true">
  <ellipse cx="50" cy="104" rx="26" ry="5" fill="rgba(43,38,34,.14)"/>
  <rect x="33" y="84" width="12" height="18" rx="5" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <rect x="55" y="84" width="12" height="18" rx="5" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <rect x="14" y="58" width="14" height="28" rx="7" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <rect x="72" y="58" width="14" height="28" rx="7" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <path d="M26 92 V64 q0-14 12-14 h24 q12 0 12 14 V92 q0 6-6 6 H32 q-6 0-6-6z" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <circle cx="50" cy="34" r="22" fill="${color}" stroke="#2b2622" stroke-width="2.4"/>
  <ellipse cx="50" cy="38" rx="16" ry="13" fill="#fff6e4" opacity=".92"/>
  ${eyes}${mouth}
</svg>`;
}

// keep global shortcuts away from text fields
export function trapKeys(el) {
  el.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
}
