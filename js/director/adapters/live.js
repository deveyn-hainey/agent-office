// Live adapter (read-only). Only loaded when the page is served under /live/ (behind Cloudflare Access).
// Polls same-origin `api/events?since=<id>` every 30 s and feeds already-sanitised director events into the office.
// It never writes anywhere: the only request it makes is a GET of the event feed.
//
// Event shape (from the Worker / KV, produced by deploy/live/slack-to-office.mjs):
//   { id: "<sortable string>", ts: <epoch ms>, type: <director event type> | 'operator', ...fields }
//   'feed'     -> chat pane line { channel, who, text }
//   'operator' -> a human in the Operator Room { who, text, slot?, target? }
//   everything else goes straight to director.ingest(): say, status, move, board, jira, ci, screen, finding, ask, toast, cheer, …
import { truncate } from '../../core/util.js';

const POLL_MS = 30e3;
const STATE_TYPES = new Set(['jira', 'ci', 'board', 'screen', 'finding', 'binder', 'xray', 'surface', 'status']);
const CHAT_TYPES = new Set(['feed', 'operator']);
const BACKFILL_CHAT = 40, BACKFILL_ANIMATE = 8;

export function createAdapter(ctx, opts = {}) {
  const { bus } = ctx;
  const D = () => ctx.director;
  const base = opts.url || 'api/events';
  const seen = new Set();
  const queue = [];
  let since = '', timer = 0, playing = false, first = true, fails = 0, updated = 0, stopped = false;
  const releaseTimers = new Map();

  /* ---------------------------------------------------------------- pill */
  const pill = document.createElement('div');
  pill.className = 'live-pill';
  pill.innerHTML = '<i></i><span>LIVE · read-only</span><small></small>';
  (document.getElementById('ui-root') || document.body).append(pill);
  const small = pill.querySelector('small');
  const paintPill = () => {
    if (!updated) { small.textContent = 'connecting…'; return; }
    const m = Math.round((Date.now() - updated) / 60e3);
    small.textContent = m < 1 ? 'updated just now' : `updated ${m}m ago`;
    pill.classList.toggle('stale', fails > 2);
  };
  setInterval(paintPill, 15e3);
  paintPill();

  /* ---------------------------------------------------------------- apply */
  const chat = (e) => bus.emit('slack:message', { channel: e.channel || '#build-room', who: e.who || 'Team', text: truncate(e.text || '', 140), ts: e.ts || Date.now() });
  function holdThenRelease(agent, sec = 45) {
    if (!agent) return;
    clearTimeout(releaseTimers.get(agent));
    releaseTimers.set(agent, setTimeout(() => { D()?.release?.([agent]); releaseTimers.delete(agent); }, sec * 1000));
  }
  function apply(e, { animate = true } = {}) {
    try {
      if (e.type === 'feed') { chat(e); return; }
      if (e.type === 'operator' || e.type === 'operatorAnim') {
        if (e.type === 'operator') chat({ ...e, who: e.who || 'Operator' });
        if (animate) {
          const ops = ctx.world?.operators;
          if (ops?.prompt) ops.prompt({ text: truncate(e.text || '', 140), who: e.who || 'Operator', target: e.target || null });
          else bus.emit('toast', { text: `${e.who || 'Operator'}: ${truncate(e.text || '', 80)}`, kind: 'info' });
        }
        return;
      }
      if (!animate && !STATE_TYPES.has(e.type)) return;
      const ev = animate ? e : { ...e, quiet: true };
      D()?.ingest?.(ev);
      if (animate && (e.type === 'move' || e.type === 'say' || e.type === 'coffee')) holdThenRelease(e.agent);
    } catch (err) { console.warn('[live] event failed', e, err); }
  }
  function pump() {
    if (playing || !queue.length || stopped) return;
    playing = true;
    const e = queue.shift();
    apply(e);
    // speech-ish events get more breathing room so bubbles can be read
    const gap = e.type === 'say' || e.type === 'operator' ? 4500 + Math.random() * 1500 : e.type === 'feed' ? 600 : 1500 + Math.random() * 1500;
    setTimeout(() => { playing = false; pump(); }, gap);
  }

  function take(events) {
    const fresh = events.filter((e) => e && e.id != null && !seen.has(String(e.id))).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    for (const e of fresh) seen.add(String(e.id));
    if (fresh.length) since = String(fresh[fresh.length - 1].id);
    if (!fresh.length) return;
    if (first) {
      first = false;
      // backfill: restore board state instantly, drop recent chat into the pane, animate only the tail
      const tail = fresh.slice(-BACKFILL_ANIMATE * 3).filter((e) => !CHAT_TYPES.has(e.type) || e.type === 'operator').slice(-BACKFILL_ANIMATE);
      const tailSet = new Set(tail);
      bus.emit('boards:quiet', { on: true });
      for (const e of fresh) if (STATE_TYPES.has(e.type) && !tailSet.has(e)) { bus.emit('boards:clock', { ts: e.ts }); apply(e, { animate: false }); }
      for (const e of fresh.filter((x) => CHAT_TYPES.has(x.type)).slice(-BACKFILL_CHAT)) { bus.emit('boards:clock', { ts: e.ts }); chat(e); }
      bus.emit('boards:quiet', { on: false });
      // operator lines from the tail are already in the pane: only animate the figure
      for (const e of tail) queue.push(e.type === 'operator' ? { ...e, type: 'operatorAnim' } : e);
    } else {
      queue.push(...fresh);
    }
    pump();
  }
  async function poll() {
    if (stopped) return;
    try {
      const r = await fetch(`${base}${since ? `?since=${encodeURIComponent(since)}` : ''}`, { credentials: 'same-origin', cache: 'no-store', redirect: 'manual', headers: { Accept: 'application/json' } });
      if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) {
        fails++;
        bus.emit('toast', { text: 'Session expired — reload the page to sign in again.', kind: 'warn' });
        paintPill();
        return schedule(POLL_MS * 4);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      fails = 0;
      updated = j.updated || Date.now();
      take(Array.isArray(j.events) ? j.events : []);
      paintPill();
      schedule(POLL_MS);
    } catch (err) {
      fails++;
      console.warn('[live] poll failed', err);
      paintPill();
      schedule(Math.min(5 * 60e3, POLL_MS * 2 ** Math.min(fails, 4)));
    }
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(poll, ms); }

  return {
    id: 'live-readonly',
    start() {
      stopped = false;
      // free play underneath: ambient office life fills the gaps between real events
      try { D()?.freePlay?.(); D()?.setAmbient?.(true); ctx.clock?.play?.(); } catch { /* optional */ }
      poll();
    },
    stop() { stopped = true; clearTimeout(timer); },
    get queued() { return queue.length; },
    get since() { return since; },
  };
}
