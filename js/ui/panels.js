// Top pill, left panel (floors / approvals / finished / routines), right panel (bots) and the desk-view card.
import { STATES, esc, truncate, denverHM, denverHMS, mmss } from '../core/util.js';
import { $, h, avatarHTML, meepleSVG, trapKeys } from './dom.js';

const setHTML = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
const STATUS_ORDER = ['working', 'waiting', 'error', 'resting'];
const CHIP_LABEL = { working: 'working', waiting: 'waiting', error: 'errors', resting: 'resting', finished: 'finished' };

export function createPanels(ctx, store, api) {
  const { bus, clock } = ctx;
  const floors = ctx.data.world.floors || [];
  const accent = (i) => floors[i]?.accent || '#d9ccb3';
  const cam = () => ctx.cam || ctx.scene?.cam;
  const view = () => cam()?.getView?.() || { type: 'all' };
  let scenarioTitle = '';
  let prevView = { type: 'all' };

  // ------------------------------------------------------------------ top pill
  const pill = $('top-pill');
  function renderPill() {
    const c = store.counts();
    const chips = [...STATUS_ORDER, ...(c.finished ? ['finished'] : [])].map((k) => {
      const n = c[k] || 0;
      return `<span class="chip st-${k}${n ? '' : ' zero'}"><i style="background:${STATES[k].color}"></i><b>${n}</b> ${CHIP_LABEL[k]}</span>`;
    }).join('');
    setHTML(pill, `<span class="brand"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="5" fill="#d97757" stroke="#2b2622" stroke-width="1.6"/><circle cx="7.4" cy="9" r="1.5" fill="#2b2622"/><circle cx="12.6" cy="9" r="1.5" fill="#2b2622"/><path d="M7 13q3 2.4 6 0" stroke="#2b2622" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><span class="serif">Office Bot</span></span>`
      + `<span class="chips">${chips}</span>`
      + `<span class="sep"></span><span class="scn" title="Scenario">${esc(scenarioTitle || 'Free play · ambient life')}</span>`
      + `<time id="pill-clock">${denverHMS(Date.now())}</time><span class="tz">MT</span>`);
  }
  setInterval(() => { const el = $('pill-clock'); if (el) el.textContent = denverHMS(Date.now()); }, 1000);
  bus.on('replay:load', (e) => { scenarioTitle = e.title || ''; renderPill(); });
  bus.on('ui:scenario', (e) => { scenarioTitle = e.title || ''; });

  // ------------------------------------------------------------------ left panel
  const left = $('left-panel');
  function floorRows() {
    const cur = view();
    const all = store.agents(true);
    let out = '';
    for (let f = 3; f >= 0; f--) {
      const here = all.filter((a) => a.floor === f);
      const dots = here.map((a) => `<i class="bd" title="${esc(a.short)} · ${esc(STATES[a.status]?.label || a.status)}" style="--c:${a.color};--s:${STATES[a.status]?.color || '#a49d90'}"></i>`).join('');
      const on = cur.type === 'floor' && cur.floor === f;
      out += `<button class="floor-row${on ? ' on' : ''}" data-floor="${f}"><span class="fbadge" style="background:${accent(f)}">${f + 1}F</span><span class="fname">${esc(floors[f]?.name || store.FLOOR_NAMES[f])}</span><span class="dots">${dots}</span><span class="fcount">${here.length}</span></button>`;
    }
    return out;
  }
  function renderLeft() {
    const s = store.state;
    const asks = s.asks.map((a) => {
      const ag = store.agent(a.agent) || { id: a.agent, short: a.agent, color: '#a49d90' };
      return `<div class="ask" data-ask-card="${esc(a.id)}"><div class="ask-h">${avatarHTML(ag, 24, STATES.waiting.color)}<b>${esc(ag.short)}</b><span class="muted">${esc(store.floorName(ag.floor).slice(0, 2))}</span><span class="bang">!</span></div><p>${esc(a.text)}</p><div class="btns">${(a.options || ['Approve', 'Skip']).map((o, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-ask="${esc(a.id)}" data-choice="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
    }).join('') || `<div class="empty">Nothing needs you right now <span class="ok">✓</span></div>`;
    const fin = s.finished.map((f) => {
      const ag = store.agent(f.agent) || { short: f.agent || '—', color: '#4c8dff' };
      const tag = f.choice ? `<span class="tag ${/skip/i.test(f.choice) ? 'skip' : 'ok'}">${esc(f.choice)}</span>` : f.kind === 'handoff' ? '<span class="tag">handoff</span>' : '';
      return `<div class="fin"><i class="tick">✓</i><div><div class="fin-t">${esc(truncate(f.text, 58))}</div><div class="muted">${esc(ag.short)} · ${denverHM(f.ts)} ${tag}</div></div></div>`;
    }).join('') || `<div class="empty">Finished work lands here</div>`;
    const R = [
      ['ambient', 'Ambient office life', 'Coffee runs, naps, chats'],
      ['standups', 'Hourly standups', 'Quick huddle bubbles'],
      ['daynight', 'Day/night lighting', 'Follows Denver time'],
      ['camera', 'Auto camera follow', 'Director steers the view'],
    ].map(([id, t, d]) => `<label class="routine"><span><b>${t}</b><small>${d}</small></span><input type="checkbox" class="sw" data-routine="${id}" ${s.routines[id] ? 'checked' : ''}><i class="swi"></i></label>`).join('');
    setHTML(left, `<section class="card sec"><h3 class="serif">Floors</h3><div class="floor-list">${floorRows()}</div></section>`
      + `<section class="card sec"><h3 class="serif">Waiting on me${s.asks.length ? ` <em class="count">${s.asks.length}</em>` : ''}</h3>${asks}</section>`
      + `<section class="card sec"><h3 class="serif">Finished</h3>${fin}</section>`
      + `<section class="card sec"><h3 class="serif">Routines</h3>${R}<button class="btn wide" data-act="map">🗺 Project map</button></section>`);
  }
  left.addEventListener('click', (e) => {
    const t = e.target;
    const ask = t.closest('[data-ask]'); if (ask) { ctx.director?.answer?.(ask.dataset.ask, ask.dataset.choice); return; }
    const fl = t.closest('[data-floor]'); if (fl) { cam()?.setView({ type: 'floor', floor: +fl.dataset.floor }); return; }
    const a = t.closest('[data-act]'); if (a?.dataset.act === 'map') api.openProjectMap();
  });
  left.addEventListener('change', (e) => {
    const r = e.target.closest('[data-routine]'); if (r) store.toggleRoutine(r.dataset.routine, r.checked);
  });

  // ------------------------------------------------------------------ right panel (bots)
  const right = $('right-panel');
  function renderRight() {
    const v = view();
    const list = store.agents(true);
    const shown = v.type === 'floor' ? list.filter((a) => a.floor === v.floor) : list;
    const title = v.type === 'floor' ? `Bots on ${store.floorName(v.floor)}` : 'Bots in the office';
    const rows = shown.map((a) => `<button class="bot" data-agent="${esc(a.id)}" style="--c:${a.color}">${avatarHTML(a, 30, STATES[a.status]?.color)}<span class="bot-m"><b>${esc(a.short)}${a.kind === 'subagent' ? ' <small class="sub">sub</small>' : ''}</b><span class="muted">${esc(a.role)}</span><span class="act">${esc(truncate(store.activityText(a.id), 64))}</span></span><span class="bot-r">${v.type === 'floor' ? '' : `<span class="ftag" style="background:${accent(a.floor)}">${a.floor + 1}F</span>`}<i class="stdot" style="background:${STATES[a.status]?.color}" title="${esc(STATES[a.status]?.label || '')}"></i></span></button>`).join('')
      || '<div class="empty">Nobody is on this floor right now.</div>';
    setHTML(right, `<section class="card sec"><h3 class="serif">${esc(title)} <em class="count">${shown.length}</em></h3><div class="bots">${rows}</div></section>`);
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
      <div class="desk-hero"><div class="portrait"></div><div class="who"><h2 class="serif"></h2><div class="muted role"></div><span class="state-chip"></span></div></div>
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
    refs.chip.textContent = st.label; refs.chip.style.setProperty('--sc', st.color);
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

  function renderAll() { renderPill(); renderLeft(); if (deskId) renderDesk(); else renderRight(); }
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
