// Shared helpers (no three.js dependency).
export const TZ = 'America/Denver';

// v2 agent status vocabulary (semantic colors from the brief)
export const STATES = {
  working: { label: 'Working', color: '#3fae5a' },
  waiting: { label: 'Waiting on you', color: '#f2b632' },
  error: { label: 'Error', color: '#e25a4f' },
  resting: { label: 'Resting', color: '#a49d90' },
  finished: { label: 'Finished', color: '#4c8dff' },
};

export const PALETTE = ['#ff8a4c', '#4c8dff', '#9b6bff', '#f2c94c', '#3cc8b4', '#ef5da8', '#7bd05a', '#ff6b6b'];
export const OUTLINE = '#2b2622';
export const CREAM = '#f4ecdc';

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function colorFor(agent) {
  return agent.color || PALETTE[hash(agent.id) % PALETTE.length];
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function truncate(s, n = 40) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// shortest signed angle difference
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

const hmFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hmsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const fullFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

export function denverHM(d) {
  d = new Date(d);
  return isNaN(d) ? '--:--' : hmFmt.format(d);
}
export function denverHMS(d) {
  d = new Date(d);
  return isNaN(d) ? '--:--:--' : hmsFmt.format(d);
}
export function denverFull(d) {
  d = new Date(d);
  return isNaN(d) ? 'unknown' : fullFmt.format(d);
}
// "1:05" style mm:ss for replay time
export function mmss(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function relative(d, now = Date.now()) {
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// URL params -> typed object (see ARCHITECTURE.md "URL parameters")
export function parseParams(search = location.search) {
  const q = new URLSearchParams(search);
  const num = (k, d) => (q.has(k) && isFinite(+q.get(k)) ? +q.get(k) : d);
  const flag = (k) => q.get(k) === '1' || q.get(k) === 'true';
  return {
    demo: q.get('demo') || null,
    view: q.get('view') || 'all',
    speed: num('speed', 1),
    seek: num('seek', 0),
    clean: flag('clean'),
    paused: flag('paused'),
    ambient: q.get('ambient') !== '0',
    debug: flag('debug'),
    raw: q,
  };
}

// "all" | "floor:2" (floor NUMBER, 1-based) | "desk:codex"  ->  {type:'all'} | {type:'floor',floor:1 (index)} | {type:'desk',agent:'codex'}
export function parseView(v) {
  if (!v) return { type: 'all' };
  if (typeof v === 'object') return v;
  const [t, a] = String(v).split(':');
  if (t === 'floor') return { type: 'floor', floor: clamp((parseInt(a, 10) || 1) - 1, 0, 3) };
  if (t === 'desk' && a) return { type: 'desk', agent: a };
  return { type: 'all' };
}
