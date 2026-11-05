// Top pill, needs-you card, left panel (floors / approvals / finished / routines), right floor card (bots) and the desk-view card.
import { STATES, esc, truncate, denverHM } from '../core/util.js';
import { $, h, avatarHTML, meepleSVG, trapKeys, SC, morph } from './dom.js';

const setHTML = morph; // in-place DOM updates: no blank frames / replayed animations on re-render
const STATUS_ORDER = ['working', 'waiting', 'error', 'resting'];
const CHIP_LABEL = { working: 'working', waiting: 'waiting', error: 'errors', resting: 'resting', finished: 'finished' };
const SHORT = { working: 'Working', waiting: 'Waiting', error: 'Error', resting: 'Resting', finished: 'Finished' };
const CHEV = '<svg class="chev" viewBox="0 0 12 12" width="12" height="12"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function createPanels(ctx, store, api) {
  const { bus } = ctx;
  const cam = () => ctx.cam || ctx.scene?.cam;
  const view = () => cam()?.getView?.() || { type: 'all' };
  let prevView = { type: 'all' };

  // ------------------------------------------------------------------ top pill + needs-you card
  const pill = $('top-pill');
  function renderPill() {
    const c = store.counts();
    const chips = [...STATUS_ORDER, ...(c.finished ? ['finished'] : [])].map((k) => {
      const n = c[k] || 0;
      return `<span class="chip st-${k}${n ? '' : ' zero'}"><i style="background:${SC[k]}"></i><b>${n}</b> ${CHIP_LABEL[k]}</span>`;
    }).join('');
    setHTML(pill, `<span class="chips">${chips}</span>`);
  }
  const needs = $('needs-card');
  function renderNeeds() {
    const a = store.state.asks[0];
    if (!a) { needs.hidden = true; needs._html = ''; return; }
    const ag = store.agent(a.agent) || { short: a.agent, color: '#a7acb4' };
    const more = store.state.asks.length > 1 ? `<span class="more">+${store.state.asks.length - 1}</span>` : '';
    const opt = (a.options || ['Approve'])[0];
    setHTML(needs, `<span class="nsq" style="background:${ag.color}"></span><div class="ntx"><b>${esc(ag.short)} needs you</b><span>${esc(truncate(a.text, 64))}</span></div>${more}<button class="btn grey" data-n="view" data-agent="${esc(a.agent)}">View</button><button class="btn primary" data-n="ok" data-ask="${esc(a.id)}" data-choice="${esc(opt)}">${/^approve/i.test(opt) ? 'Approve' : esc(opt)}</button>`);
    needs.hidden = false;
  }
  needs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    if (b.dataset.n === 'view') api.openDeskView(b.dataset.agent);
    else ctx.director?.answer?.(b.dataset.ask, b.dataset.choice);
  });

  // ------------------------------------------------------------------ left panel
  const left = $('left-panel');
  const openSecs = new Set(['waiting']);
  const sec = (key, title, count, body, badge) => `<section class="card sec coll${openSecs.has(key) ? ' open' : ''}" data-sec="${key}"><button class="coll-h" data-toggle="${key}"><span class="t">${title}</span>${count != null ? `<em class="count${badge ? ' ' + badge : ''}">${count}</em>` : ''}${CHEV}</button><div class="coll-b"><div class="coll-i">${body}</div></div></section>`;
  function floorRows() {
    const cur = view();
    const all = store.agents(true);
    let out = '';
    for (let f = 3; f >= 0; f--) {
      const here = all.filter((a) => a.floor === f);
      const dots = here.map((a) => `<i class="bd" title="${esc(a.short)} · ${esc(STATES[a.status]?.label || a.status)}" style="background:${SC[a.status] || SC.resting}"></i>`).join('');
      const on = cur.type === 'floor' && cur.floor === f;
      const w = here.filter((a) => a.status === 'working').length;
      out += `<button class="floor-row${on ? ' on' : ''}" data-floor="${f}"><span class="fnum">${f + 1}</span><span class="fmid"><span class="fname">${esc(store.FLOOR_NAMES[f] || '')}</span><span class="dots">${dots}</span></span><span class="fcount">${w}/${here.length}</span></button>`;
    }
    return out;
  }
  function renderLeft() {
    const s = store.state;
    const asks = s.asks.map((a) => {
      const ag = store.agent(a.agent) || { id: a.agent, short: a.agent, color: '#a7acb4' };
      return `<div class="ask" data-ask-card="${esc(a.id)}"><div class="ask-h">${avatarHTML(ag, 22)}<b>${esc(ag.short)}</b><span class="bang">!</span></div><p>${esc(a.text)}</p><div class="btns">${(a.options || ['Approve', 'Skip']).map((o, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-ask="${esc(a.id)}" data-choice="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
    }).join('') || '<div class="empty">Nothing needs you</div>';
    const fin = s.finished.map((f) => {
      const ag = store.agent(f.agent) || { short: f.agent || '—', color: SC.finished };
      const tag = f.choice ? `<span class="tag ${/skip/i.test(f.choice) ? 'skip' : 'ok'}">${esc(f.choice)}</span>` : f.kind === 'handoff' ? '<span class="tag">handoff</span>' : '';
      return `<div class="fin"><i class="tick">✓</i><div><div class="fin-t">${esc(truncate(f.text, 58))}</div><div class="muted">${esc(ag.short)} · ${denverHM(f.ts)} ${tag}</div></div></div>`;
    }).join('') || '<div class="empty">Finished work lands here</div>';
    const R = [
      ['ambient', 'Ambient office life', 'Coffee runs, naps, chats'],
      ['standups', 'Hourly standups', 'Quick huddle bubbles'],
      ['daynight', 'Day/night lighting', 'Follows Denver time'],
      ['camera', 'Auto camera follow', 'Director steers the view'],
    ].map(([id, t, d]) => `<label class="routine"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" class="sw" data-routine="${id}" ${s.routines[id] ? 'checked' : ''}><i class="swi"></i></label>`).join('');
    setHTML(left, `<section class="card sec" data-sec="floors"><h3 class="fh"><span>Floors</span><em>4</em></h3><div class="floor-list">${floorRows()}</div></section>`
      + sec('waiting', 'Waiting on me', s.asks.length, asks, s.asks.length ? 'warn' : '')
      + sec('finished', 'Finished', s.finished.length, fin)
      + sec('routines', 'Routines', 4, `${R}<button class="btn wide" data-act="map">Project map</button>`));
  }
  left.addEventListener('click', (e) => {
    const t = e.target;
    const ask = t.closest('[data-ask]'); if (ask) { ctx.director?.answer?.(ask.dataset.ask, ask.dataset.choice); return; }
    const tg = t.closest('[data-toggle]');
    if (tg) {
      const k = tg.dataset.toggle, opening = !openSecs.has(k);
      if (opening) openSecs.add(k); else openSecs.delete(k);
      renderLeft();
      // an opened tile below the fold glides into view once it has expanded (the column itself never changes size)
      if (opening) setTimeout(() => left.querySelector(`[data-sec="${k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 270);
      return;
    }
    const fl = t.closest('[data-floor]'); if (fl) { cam()?.markUser?.(); cam()?.setView({ type: 'floor', floor: +fl.dataset.floor }); return; }
    const a = t.closest('[data-act]'); if (a?.dataset.act === 'map') api.openProjectMap();
  });
  left.addEventListener('change', (e) => {
    const r = e.target.closest('[data-routine]'); if (r) store.toggleRoutine(r.dataset.routine, r.checked);
  });

  // ------------------------------------------------------------------ right panel (floor card + bots)
  const right = $('right-panel');
  function renderRight() {
    const v = view();
    const list = store.agents(true);
    const shown = v.type === 'floor' ? list.filter((a) => a.floor === v.floor) : list;
    const working = shown.filter((a) => a.status === 'working').length;
    const title = v.type === 'floor' ? (store.FLOOR_NAMES[v.floor] || 'Floor').split(' / ')[0] : 'Office';
    const sub = v.type === 'floor' ? `Floor ${v.floor + 1} · ${shown.length} bots` : `4 floors · ${shown.length} bots`;
    const rows = shown.map((a) => `<button class="bot" data-agent="${esc(a.id)}" style="--c:${a.color}"><span class="bsq"><i style="background:${a.color}"></i></span><span class="bot-m"><b>${esc(a.short)}${a.kind === 'subagent' ? ' <small class="sub">sub</small>' : ''}</b><span class="act">${esc(SHORT[a.status] || 'Resting')} · ${esc(truncate(store.activityText(a.id), 56))}</span></span><i class="stdot" style="background:${SC[a.status] || SC.resting}" title="${esc(STATES[a.status]?.label || '')}"></i></button>`).join('')
      || '<div class="empty">Nobody is on this floor right now.</div>';
    setHTML(right, `<section class="card fcard"><header class="fhead"><div class="fh-top"><b>${esc(title)}</b><span>${sub}</span></div><div class="fh-big"><b>${working}</b> working</div></header><div class="bots">${rows}</div></section>`);
  }
  right.addEventListener('click', (e) => { const b = e.target.closest('[data-agent]'); if (b) api.openDeskView(b.dataset.agent); });

  // ------------------------------------------------------------------ desk view
  const desk = $('desk-view');
  let deskId = null;
  const chats = new Map(); // agentId -> [{who:'you'|'bot', text}]
  let refs = null;

  function buildDesk(id) {
    const a = store.agent(id); if (!a) return;
    desk.innerHTML = '';
    const q = (sel) => desk.querySelector(sel);
    desk.innerHTML = `<section class="card sec desk-card" style="--c:${a.color}">
      <div class="desk-top"><button class="btn small" data-d="back">‹ Back</button><span class="muted">Desk view</span><button class="btn small ghost" data-d="close" aria-label="Close desk view">✕</button></div>
      <div class="desk-hero"><div class="portrait"></div><div class="who"><h2></h2><div class="muted role"></div><span class="state-chip"></span></div></div>
      <div class="kv"><div><span class="k">Location</span><span class="v loc"></span></div><div><span class="k">Doing now</span><span class="v task"></span></div></div>
      <div class="stats"></div>
      <button class="btn wide binder-btn" data-d="binder">📓 Open binder / notebook</button>
      <div class="chat"><div class="chat-log"></div><form class="chat-form" autocomplete="off"><input class="chat-in" maxlength="200" aria-label="Chat with this agent"><button class="btn primary" type="submit">Send</button></form></div>
    </section>`;
    refs = { portrait: q('.portrait'), name: q('h2'), role: q('.role'), chip: q('.state-chip'), loc: q('.loc'), task: q('.task'), stats: q('.stats'), log: q('.chat-log'), input: q('.chat-in'), form: q('.chat-form'), card: q('.desk-card') };
    trapKeys(refs.input);
    refs.input.placeholder = `Message ${a.short}…`;
    refs.form.addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
    renderChat();
  }
  function locText(a) {
    const slot = a.slotId && ctx.world?.slot?.(a.slotId);
    const room = slot?.room && ctx.world?.room?.(slot.room);
    const bit = room?.label || (a.slotId || '').replace(/-\d?f?/g, ' ').replace(/\b(\w)/g, (m) => m.toUpperCase()).trim();
    return `${store.floorName(a.floor)}${bit ? ' · ' + bit : ''}`;
  }
  let lastDeskSig = '';
  function renderDesk() {
    if (!deskId || !refs) return;
    const a = store.agent(deskId); if (!a) return;
    const st = STATES[a.status] || STATES.resting;
    const s = store.statsFor(deskId);
    const sig = [a.status, a.color].join('|');
    if (sig !== lastDeskSig) { lastDeskSig = sig; refs.portrait.innerHTML = meepleSVG(a.color, a.status); }
    refs.name.textContent = a.name;
    refs.role.textContent = `${a.role}${a.seat ? ' · ' + a.seat : ''}`;
    refs.chip.textContent = st.label; refs.chip.style.setProperty('--sc', SC[a.status] || SC.resting);
    refs.loc.textContent = locText(a);
    refs.task.textContent = store.activityText(deskId);
    setHTML(refs.stats, [['Tasks done', s.tasks, '✔'], ['Reviews', s.reviews, '🔎'], ['Coffees', s.coffees, '☕'], ['Naps', s.naps, '💤'], ['Min working', s.minutes, '⏱']].map(([k, v, i]) => `<div class="stat"><span class="si">${i}</span><b>${v}</b><span class="muted">${k}</span></div>`).join(''));
  }
  function renderChat() {
    if (!refs) return;
    const log = chats.get(deskId) || [];
    const a = store.agent(deskId);
    refs.log.innerHTML = log.length ? log.map((m) => `<div class="msg ${m.who}"><span>${esc(m.text)}</span></div>`).join('')
      : `<div class="empty">Say something to ${esc(a?.short || 'them')} — it goes to the command parser with them preselected.</div>`;
    refs.log.scrollTop = refs.log.scrollHeight;
  }
  function sendChat() {
    const text = refs.input.value.trim(); if (!text || !deskId) return;
    refs.input.value = '';
    const a = store.agent(deskId);
    const log = chats.get(deskId) || []; chats.set(deskId, log);
    log.push({ who: 'you', text }); log.push({ who: 'bot pending', text: '…' }); renderChat();
    const pending = log[log.length - 1];
    const cmd = /^(tell|ask|send|have|let|get|make)\b/i.test(text) || text.toLowerCase().startsWith(a.short.toLowerCase()) ? text : `tell ${a.short} to ${text}`;
    const done = (res) => { pending.who = 'bot'; pending.text = res?.summary || (res?.ok === false ? `Hmm, I didn't catch that.` : 'On it.'); if (deskId === a.id) renderChat(); };
    Promise.resolve(ctx.director?.command?.(cmd)).then(done, () => done({ ok: false }));
    if (!ctx.director?.command) done({ summary: 'The director is offline in this build.' });
  }
  desk.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    if (b.dataset.d === 'binder') api.openBinder(deskId); else api.closeDeskView();
  });

  function showDesk(id) {
    if (deskId !== id) { deskId = id; lastDeskSig = ''; buildDesk(id); }
    desk.hidden = false; right.hidden = true; renderDesk();
  }
  function hideDesk() { deskId = null; refs = null; desk.hidden = true; right.hidden = false; renderRight(); }

  bus.on('cam:view', ({ view: v, prev }) => {
    if (v?.type === 'desk') { if (prev && prev.type !== 'desk') prevView = prev; showDesk(v.agent); } else if (deskId) hideDesk();
    renderAll();
  });

  function renderAll() { renderPill(); renderNeeds(); renderLeft(); if (deskId) renderDesk(); else renderRight(); }
  store.subscribe(renderAll);
  renderAll();
  bus.on('app:ready', renderAll);
  const v0 = view(); if (v0.type === 'desk') showDesk(v0.agent);

  return {
    renderAll,
    get deskId() { return deskId; },
    get prevView() { return prevView; },
    focusChat() { refs?.input?.focus(); },
  };
}
