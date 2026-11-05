// Live activity log (mono, newest first) and the read-only Slack-style replay pane.
import { esc, hash, truncate, denverHM } from '../core/util.js';
import { $, h, avatarHTML } from './dom.js';

const ROLE_TAG = {
  lead: 'LEAD', codex: 'ENG', musecode: 'PRODUCT', muse: 'RESEARCH', grok: 'QA', cursor: 'UI',
  argon: 'REVIEW', chatgpt: 'CONNECTOR', reva: 'REVIEW·A', revb: 'REVIEW·B', ops: 'CI', scout: 'SCOUT', you: 'APPROVER',
};
const LIVE = () => document.body.classList.contains('live-mode');
const DEMO_CHANNELS = ['build-room', 'decisions', 'review'];
const LIVE_CHANNELS = ['build-room', 'decisions', 'scratchpad']; // + any other channel that appears in the live feed
const LOG_CAP = 60, MSG_CAP = 120;
const REACTS = ['👍', '✅', '👀', '🎉', '🚀', '🔥'];

export function createFeeds(ctx, store) {
  const { bus, clock } = ctx;

  // ------------------------------------------------------------------ activity log
  const logEl = $('activity-log');
  logEl.innerHTML = `<header><h3>Activity</h3></header><div class="rows" role="log"></div>`;
  const rows = logEl.querySelector('.rows');
  const emptyLog = () => { rows.innerHTML = '<div class="empty">Waiting for the team to do something…</div>'; };
  emptyLog();
  let logCount = 0;
  bus.on('activity', (e) => {
    if (!e) return;
    if (!logCount) rows.innerHTML = '';
    logCount++;
    const a = store.agent(e.agent) || { short: e.agent === 'you' ? 'You' : String(e.agent || 'Office'), color: '#8b9099' };
    const row = h('div.row.k-' + (e.kind || 'log'), { html: `<time>${denverHM(e.ts)}</time> <b style="color:${a.color === '#2f2f35' ? '#111' : a.color}">${esc(a.short)}</b> · <span>${esc(e.text)}</span>` });
    rows.prepend(row);
    while (rows.children.length > LOG_CAP) rows.lastChild.remove();
  });
  bus.on('replay:reset', () => { logCount = 0; emptyLog(); });

  // ------------------------------------------------------------------ slack pane
  const pane = $('slack-pane');
  const day = Date.now() - 3 * 3600e3;
  const seeds = () => (LIVE() ? {} : {
    'build-room': [
      { who: 'Cursor', text: 'Theme tokens landed on main — PR #204 is green.', ts: day, react: [['✅', 2]] },
      { who: 'Codex', text: 'Odds-screen refactor is behind a flag; I’ll rebase after standup.', ts: day + 14 * 60e3, react: [['👍', 1]] },
    ],
    decisions: [
      { who: 'Lead', text: 'D-12 locked: keep the odds feed mocked for the demo build.', ts: day + 3e3 * 60, react: [['✅', 3]] },
      { who: 'ChatGPT', text: 'For the record — no live data sources until the read-only phase ends.', ts: day + 5e3 * 60, react: [] },
    ],
    review: [
      { who: 'Argon', text: 'PR #203 looks clean — two nits, no blockers.', ts: day + 9e3 * 60, react: [['👀', 1]] },
      { who: 'Grok', text: 'Device matrix pass on the small iPhone: all good.', ts: day + 11e3 * 60, react: [['👍', 2]] },
    ],
  });
  let chans, active = 'build-room', unread = {}, only = null; // only: channel filter (live) -> just that tab
  const reset = () => { chans = seeds(); unread = {}; active = only || 'build-room'; };
  reset();

  pane.innerHTML = `<header class="s-head"><div><h3>Team chat</h3><span class="ro"><i></i>${LIVE() ? 'LIVE · read-only mirror' : 'Scenario replay · read-only'}</span></div><button class="x" data-s="close" aria-label="Close chat">✕</button></header>
    <nav class="tabs" role="tablist"></nav><div class="s-msgs" role="log"></div>
    <footer class="s-foot"><span>${LIVE() ? '🔒 Read-only mirror of the team channels. Nothing here is ever sent back.' : '🔒 Replay only — nothing here is sent anywhere. Use the command box to talk to the team.'}</span></footer>`;
  const tabsEl = pane.querySelector('.tabs'), msgsEl = pane.querySelector('.s-msgs');

  const normChan = (c) => {
    c = String(c || '').replace(/^#/, '').toLowerCase().trim();
    return !c || c === 'pitchside' ? 'build-room' : c;
  };
  function renderTabs() {
    const names = only ? [only] : [...new Set([...(LIVE() ? LIVE_CHANNELS : DEMO_CHANNELS), ...Object.keys(chans)])];
    tabsEl.innerHTML = names.map((n) => `<button role="tab" class="tab${n === active ? ' on' : ''}" data-chan="${esc(n)}"># ${esc(n)}${unread[n] ? `<em>${unread[n]}</em>` : ''}</button>`).join('');
  }
  function msgNode(m, fresh) {
    const a = store.find(m.who);
    const you = m.you || /^you$/i.test(m.who);
    const ag = a || { id: 'x', short: m.who, name: m.who, color: '#a7acb4' };
    const tag = a ? ROLE_TAG[a.id] : m.who && /bot|ci/i.test(m.who) ? 'BOT' : '';
    const el = h('div.sm' + (you ? '.you' : '') + (fresh ? '.slide' : ''), {
      html: `${avatarHTML(ag, 30)}<div class="sb"><div class="sh"><b>${esc(a ? a.short : m.who)}</b>${tag ? `<span class="rtag">${tag}</span>` : ''}<time>${denverHM(m.ts)}</time></div><div class="stx">${esc(m.text)}</div><div class="rx"></div></div>`,
    });
    const rx = el.querySelector('.rx');
    const paint = () => { rx.innerHTML = (m.react || []).map(([e, n]) => `<span class="re">${e} <b>${n}</b></span>`).join(''); };
    paint();
    if (fresh && !m.react && !LIVE()) {
      // a believable reaction shows up a moment later
      const hh = hash(m.text + m.who);
      const delay = you ? 1600 : 1200 + (hh % 1400);
      m.react = [];
      if (you || hh % 5 < 3) setTimeout(() => {
        m.react = [[you ? '👀' : REACTS[hh % REACTS.length], 1 + ((hh >> 4) % 3)]];
        paint(); rx.classList.add('pop');
      }, delay);
    }
    return el;
  }
  function renderMsgs() {
    msgsEl.innerHTML = '';
    for (const m of chans[active] || []) msgsEl.append(msgNode(m, false));
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function render() { renderTabs(); renderMsgs(); }
  render();

  bus.on('slack:message', (m) => {
    if (!m) return;
    const c = normChan(m.channel);
    const arr = (chans[c] ||= []);
    const msg = { who: m.who || 'Office', text: m.text || '', ts: m.ts || clock.simDate().getTime(), you: !!m.you };
    arr.push(msg);
    if (arr.length > MSG_CAP) arr.shift();
    if (c === active) {
      const stick = msgsEl.scrollTop + msgsEl.clientHeight > msgsEl.scrollHeight - 40;
      msgsEl.append(msgNode(msg, true));
      while (msgsEl.children.length > MSG_CAP) msgsEl.firstChild.remove();
      if (stick) msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' });
      renderTabs();
    } else { unread[c] = (unread[c] || 0) + 1; if (!tabsEl.querySelector(`[data-chan="${CSS.escape(c)}"]`)) renderTabs(); else renderTabs(); }
    if (!isOpen) badge();
  });
  // decisions get a system line in #decisions
  bus.on('vote:locked', (v) => bus.emit('slack:message', { channel: '#decisions', who: 'Decision log', text: `${v.proposal} locked — ${v.text || ''}`, ts: clock.simDate().getTime() }));
  bus.on('replay:reset', () => { reset(); render(); });
  bus.on('channel:filter', ({ channel }) => { only = channel && channel !== 'all' ? normChan(channel) : null; active = only || 'build-room'; if (only) unread[only] = 0; render(); });

  pane.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chan]');
    if (t) { active = t.dataset.chan; unread[active] = 0; render(); return; }
    if (e.target.closest('[data-s=close]')) setOpen(false);
  });

  let isOpen = false;
  const badgeEl = () => document.querySelector('[data-t=chat] .bdg');
  function badge() { const b = badgeEl(); if (b) { b.hidden = false; b.textContent = '•'; } }
  function setOpen(on) {
    isOpen = !!on;
    document.body.classList.toggle('slack-open', isOpen);
    pane.classList.toggle('open', isOpen);
    if (isOpen) { unread[active] = 0; renderTabs(); const b = badgeEl(); if (b) b.hidden = true; msgsEl.scrollTop = msgsEl.scrollHeight; }
    bus.emit('ui:layout', {});
  }

  return { slack: { setOpen, toggle: () => setOpen(!isOpen), get isOpen() { return isOpen; } } };
}
