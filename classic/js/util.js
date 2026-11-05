// Shared helpers (no three.js dependency).
export const TZ = 'America/Denver';

export const STATES = {
  working: { label: 'Working', color: '#34c759' },
  finished: { label: 'Finished', color: '#3b82f6' },
  'needs-you': { label: 'Needs you', color: '#f59e0b' },
  stuck: { label: 'Stuck', color: '#ef4444' },
  idle: { label: 'Idle', color: '#a3a3ab' },
};
export const ACTIVE = ['working', 'finished', 'needs-you', 'stuck'];

const PALETTE = ['#ff8a4c', '#4c8dff', '#9b6bff', '#f2c94c', '#3cc8b4', '#ef5da8', '#7bd05a', '#ff6b6b'];

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

const hmFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fullFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });

export function denverHM(d) {
  d = new Date(d);
  return isNaN(d) ? '--:--' : hmFmt.format(d);
}
export function denverFull(d) {
  d = new Date(d);
  return isNaN(d) ? 'unknown' : fullFmt.format(d);
}
export function denverClock(d = new Date()) {
  const p = {};
  for (const x of partsFmt.formatToParts(d)) p[x.type] = parseInt(x.value, 10);
  return { h: p.hour % 24, m: p.minute, s: p.second };
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
