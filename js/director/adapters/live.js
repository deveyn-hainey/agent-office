// Live adapter (read-only). Only loaded when the page is served under /live/ (behind Cloudflare Access).
// Polls same-origin `api/events?since=<id>` every 30 s and feeds already-sanitised director events into the office.
// It never writes anywhere: the only request it makes is a GET of the event feed.
//
// Event shape (from the Worker / KV, produced by deploy/live/slack-to-office.mjs):
//   { id: "<sortable string>", ts: <epoch ms>, type: <director event type> | 'operator', ...fields }
//   'feed'     -> chat pane line { channel, who, text }
//   'operator' -> a human in the Operator Room { who, text, slot?, target? }
//   everything else goes straight to director.ingest(): say, status, move, board, jira, ci, screen, finding, ask, toast, cheer, …
import { truncate, esc } from '../../core/util.js';
import { morph } from '../../ui/dom.js';

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
  const all = []; // every event received (sorted by id): the channel filter replays a subset of these
  const LS_CHAN = 'office.liveChannel';
  let channel = localStorage.getItem(LS_CHAN) || 'all';
  const inChan = (e) => channel === 'all' || (e.channel || '#build-room') === channel;
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

  // restore a set of events: board state instantly, recent chat into the pane, animate only the tail
  function restore(list) {
    const tail = list.slice(-BACKFILL_ANIMATE * 3).filter((e) => !CHAT_TYPES.has(e.type) || e.type === 'operator').slice(-BACKFILL_ANIMATE);
    const tailSet = new Set(tail);
    bus.emit('boards:quiet', { on: true });
    for (const e of list) if (STATE_TYPES.has(e.type) && !tailSet.has(e)) { bus.emit('boards:clock', { ts: e.ts }); apply(e, { animate: false }); }
    for (const e of list.filter((x) => CHAT_TYPES.has(x.type)).slice(-BACKFILL_CHAT)) { bus.emit('boards:clock', { ts: e.ts }); chat(e); }
    bus.emit('boards:quiet', { on: false });
    // operator lines from the tail are already in the pane: only animate the figure
    for (const e of tail) queue.push(e.type === 'operator' ? { ...e, type: 'operatorAnim' } : e);
  }
  // bots that show up in a channel's events (speakers, owners, review presenters, cheer groups)
  const agentsOf = (list) => {
    const out = new Set();
    for (const e of list) { for (const k of ['agent', 'owner', 'target']) if (typeof e[k] === 'string') out.add(e[k]); if (Array.isArray(e.agents)) e.agents.forEach((a) => out.add(a)); }
    return out;
  };

  function take(events) {
    const fresh = events.filter((e) => e && e.id != null && !seen.has(String(e.id))).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    for (const e of fresh) seen.add(String(e.id));
    if (fresh.length) since = String(fresh[fresh.length - 1].id);
    if (!fresh.length) return;
    all.push(...fresh);
    if (first) {
      first = false;
      picker.render();
      if (channel !== 'all' && !all.some((e) => e.channel === channel)) channel = 'all';
      if (channel !== 'all') return setChannel(channel, { force: true });
      restore(fresh);
    } else {
      queue.push(...fresh.filter(inChan));
      picker.render();
    }
    pump();
  }

  /* ---------------------------------------------------------------- channel filter */
  const dimCss = document.createElement('style'); document.head.append(dimCss);
  function setChannel(c, { force = false } = {}) {
    c = c || 'all';
    if (c === channel && !force) return;
    channel = c; localStorage.setItem(LS_CHAN, c);
    queue.length = 0;
    for (const t of releaseTimers.values()) clearTimeout(t); releaseTimers.clear();
    // clean office (boards, chat, asks, bots home), then replay only this channel's events
    try { D()?.freePlay?.(); D()?.setAmbient?.(true); } catch { /* optional */ }
    const list = all.filter(inChan);
    const keep = c === 'all' ? null : agentsOf(list);
    ctx.agents?.setDimmed?.(keep);
    // grey the roster rows of bots outside the channel too
    dimCss.textContent = keep ? `body.chan-filtered .bot[data-agent]${[...keep].map((a) => `:not([data-agent="${CSS.escape(a)}"])`).join('')}{opacity:.32;filter:grayscale(1)}` : '';
    document.body.classList.toggle('chan-filtered', c !== 'all');
    bus.emit('channel:filter', { channel: c, agents: keep ? [...keep] : null });
    restore(list);
    picker.render();
    bus.emit('toast', { text: c === 'all' ? 'Showing all channels' : `Showing only ${c}`, kind: 'info' });
    pump();
  }

  /* ---------------------------------------------------------------- picker UI (the main live control) */
  const COLORS = ['#3d7be0', '#23803f', '#a86a00', '#870b64', '#5b4fd6', '#c62828'];
  const picker = (() => {
    const el = document.createElement('nav');
    el.className = 'chan-picker'; el.setAttribute('aria-label', 'Filter the office by channel');
    (document.getElementById('ui-root') || document.body).append(el);
    const chipsEl = document.createElement('span'); chipsEl.className = 'chips';
    el.append(pill, chipsEl); // the LIVE pill rides at the left of the picker
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-chan]'); if (b) setChannel(b.dataset.chan); });
    let sig = '';
    return {
      render() {
        const counts = new Map();
        for (const e of all) if (CHAT_TYPES.has(e.type)) { const c = e.channel || '#build-room'; counts.set(c, (counts.get(c) || 0) + 1); }
        const chans = [...counts.keys()].sort((a, b) => (a === '#build-room' ? -1 : b === '#build-room' ? 1 : counts.get(b) - counts.get(a)));
        const total = [...counts.values()].reduce((n, v) => n + v, 0);
        const btn = (id, label, n, color) => `<button class="chip${channel === id ? ' on' : ''}" data-chan="${esc(id)}" aria-pressed="${channel === id}">${color ? `<i style="background:${color}"></i>` : ''}${esc(label)}<em>${n}</em></button>`;
        const html = `<span class="lbl">Channel</span>${btn('all', 'All', total)}${chans.map((c, i) => btn(c, c, counts.get(c), COLORS[i % COLORS.length])).join('')}`;
        if (html !== sig) { sig = html; morph(chipsEl, html); }
      },
    };
  })();

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
    get channel() { return channel; },
    setChannel,
  };
}
