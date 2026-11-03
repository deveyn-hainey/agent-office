// Bottom nav, replay transport, command box, drawers, keyboard shortcuts and camera insets.
import { esc, mmss, denverHM } from '../core/util.js';
import { $, h, trapKeys } from './dom.js';

const SCEN = [
  { key: 'intake', label: 'Intake & planning' },
  { key: 'review', label: 'Code review' },
  { key: 'full', label: 'Full exec demo' },
  { key: 'free', label: 'Free play' },
];
const ID_TO_KEY = { 'intake-huddle': 'intake', 'hero-review': 'review', 'full-day': 'full' };
const SUGGEST = [
  'Huddle everyone', 'Review PR 212', 'Send Codex to conference room B', 'Grok take a nap', 'Argon present findings',
  'Tell Muse to draw the bet365 logo on the lobby wall',
];

export function createControls(ctx, store, api, panels, feeds) {
  const { bus, clock } = ctx;
  const body = document.body;
  const cam = () => ctx.cam || ctx.scene?.cam;
  const isTyping = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

  // ------------------------------------------------------------------ bottom nav
  const nav = $('bottom-nav');
  nav.innerHTML = `<button data-v="all" title="All floors (A)">All floors</button>
    <span class="grp"><button data-d="-1" title="Floor down" aria-label="Previous floor">‹</button>${[1, 2, 3, 4].map((n) => `<button class="fl" data-f="${n - 1}" title="${n}F (${n})">${n}F</button>`).join('')}<button data-d="1" title="Floor up" aria-label="Next floor">›</button></span>
    <button data-v="clean" title="Clean view (C)">Clean</button>
    <span class="sepv"></span>
    <button data-t="chat" title="Team chat (S)">💬 Chat<i class="bdg" hidden></i></button>
    <button data-t="map" title="Project map (M)">🗺 Map</button>`;
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const c = cam(); if (!c) return;
    if (b.dataset.v || b.dataset.f != null || b.dataset.d || b.dataset.z) c.markUser?.();
    if (b.dataset.t) stopTour();
    if (b.dataset.v === 'all') c.setView('all');
    else if (b.dataset.v === 'clean') c.setClean(!c.isClean());
    else if (b.dataset.f != null) c.setView({ type: 'floor', floor: +b.dataset.f });
    else if (b.dataset.d) c.nextFloor(+b.dataset.d);
    else if (b.dataset.z) c.zoomBy(+b.dataset.z);
    else if (b.dataset.t === 'chat') feeds.slack.toggle();
    else if (b.dataset.t === 'map') api.openProjectMap();
  });
  const zoomBox = $('zoom-box');
  zoomBox.innerHTML = '<button data-z="1.25" title="Zoom in" aria-label="Zoom in">+</button><button data-z="0.8" title="Zoom out" aria-label="Zoom out">−</button>';
  zoomBox.addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (!b) return; cam()?.markUser?.(); cam()?.zoomBy(+b.dataset.z); });

  // ------------------------------------------------------------------ brand card: logo, live clock, Day / Night / Tour
  const brand = $('brand-card');
  brand.innerHTML = `<div class="bc-brand"><span class="logo"><i></i></span><div class="bc-t"><b>Office Bot</b><span class="live"><i></i>Live · <time>${denverHM(Date.now())}</time></span></div></div>
    <div class="bc-btns"><button data-bc="day" title="Daytime lighting">☀ Day</button><button data-bc="night" title="Night lighting">☾ Night</button><button data-bc="tour" title="Slow tour through the floors">▶ Tour</button></div>`;
  const clockEl = brand.querySelector('time');
  setInterval(() => { clockEl.textContent = denverHM(Date.now()); }, 15000);
  const lightNight = () => !!ctx.world?.lighting?.isNight?.();
  function paintTod() {
    const n = lightNight();
    brand.querySelector('[data-bc=day]').classList.toggle('on', !n);
    brand.querySelector('[data-bc=night]').classList.toggle('on', n);
  }
  setInterval(paintTod, 4000);
  // tour: dwell on each floor top to bottom, then pull back; any user input stops it
  let tour = null;
  const tourViews = [{ type: 'floor', floor: 3 }, { type: 'floor', floor: 2 }, { type: 'floor', floor: 1 }, { type: 'floor', floor: 0 }, 'all'];
  function stopTour() {
    if (!tour) return;
    clearTimeout(tour.t); tour = null;
    const b = brand.querySelector('[data-bc=tour]'); b.classList.remove('on'); b.textContent = '▶ Tour';
  }
  function tourStep() {
    if (!tour) return;
    const v = tourViews[tour.i++ % tourViews.length];
    tour.setting = true; cam()?.setView(v, { duration: 1.8 }); tour.setting = false;
    tour.t = setTimeout(tourStep, 5200);
  }
  function startTour() {
    tour = { i: 0, t: 0, setting: false };
    const b = brand.querySelector('[data-bc=tour]'); b.classList.add('on'); b.textContent = '■ Stop';
    cam()?.setClean(false);
    tourStep();
  }
  bus.on('cam:view', () => { if (tour && !tour.setting) stopTour(); });
  $('stage').addEventListener('pointerdown', stopTour);
  $('stage').addEventListener('wheel', stopTour, { passive: true });
  brand.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bc]'); if (!b) return;
    const k = b.dataset.bc;
    if (k === 'tour') { if (tour) stopTour(); else startTour(); return; }
    ctx.world?.setTimeOfDay?.(k === 'day' ? 12 : 22);
    paintTod();
  });
  bus.on('routine:toggle', () => setTimeout(paintTod, 50));
  setTimeout(paintTod, 600);

  function markNav() {
    const v = cam()?.getView?.() || { type: 'all' };
    nav.querySelector('[data-v=all]').classList.toggle('on', v.type === 'all');
    nav.querySelectorAll('.fl').forEach((b) => b.classList.toggle('on', v.type === 'floor' && +b.dataset.f === v.floor));
    nav.querySelector('[data-v=clean]').classList.toggle('on', body.classList.contains('clean'));
    nav.querySelector('[data-t=chat]').classList.toggle('on', feeds.slack.isOpen);
  }
  ['cam:view', 'cam:clean', 'ui:layout', 'app:ready'].forEach((e) => bus.on(e, markNav));
  markNav();

  // ------------------------------------------------------------------ replay controls
  const rc = $('replay-controls');
  rc.innerHTML = `<select class="scn-pick" aria-label="Scenario">${SCEN.map((s) => `<option value="${s.key}">${s.label}</option>`).join('')}</select>
    <button class="rbtn play" data-r="toggle" title="Play / pause (Space)" aria-label="Play or pause">▶</button>
    <button class="rbtn" data-r="restart" title="Restart scenario" aria-label="Restart">↺</button>
    <div class="scrub"><div class="ticks"></div><input type="range" min="0" max="1" step="0.1" value="0" aria-label="Scenario progress"><span class="chap"></span></div>
    <span class="rtime">0:00 / 0:00</span>
    <span class="spd">${[1, 2, 4].map((s) => `<button data-sp="${s}">${s}×</button>`).join('')}</span>
    <button class="demo-btn" data-r="demo" title="Run the full demo hands-free">Demo mode</button>`;
  const pick = rc.querySelector('select'), playB = rc.querySelector('.play'), range = rc.querySelector('input'), ticks = rc.querySelector('.ticks'), rtime = rc.querySelector('.rtime'), chapEl = rc.querySelector('.chap');
  let chapters = [], duration = 0, scrubbing = false, demo = false;

  const chapterAt = (t) => { let c = null; for (const k of chapters) if (k.t <= t + 0.05) c = k; return c; };
  function paintTime(t) {
    rtime.textContent = `${mmss(t)} / ${mmss(duration)}`;
    chapEl.textContent = chapterAt(t)?.label || '';
    const pct = duration ? Math.min(100, (t / duration) * 100) : 0;
    range.style.setProperty('--p', pct + '%');
  }
  function paintTransport() {
    const playing = ctx.replay ? ctx.replay.playing : !clock.paused;
    playB.textContent = playing ? '❚❚' : '▶';
    playB.classList.toggle('on', !!playing);
    rc.querySelectorAll('[data-sp]').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.sp - clock.speed) < 0.01));
    rc.querySelector('.demo-btn').classList.toggle('on', demo);
  }
  function setScenarioMeta(m) {
    chapters = m.chapters || [];
    duration = m.duration || ctx.replay?.duration || 0;
    range.max = Math.max(1, duration);
    ticks.innerHTML = chapters.map((c) => `<i style="left:${duration ? (c.t / duration) * 100 : 0}%" data-t="${c.t}" title="${esc(c.label)} · ${mmss(c.t)}"></i>`).join('');
    paintTime(0); range.value = 0;
  }
  bus.on('replay:load', (m) => {
    const k = ID_TO_KEY[m.id] || m.id;
    if (![...pick.options].some((o) => o.value === k)) pick.append(new Option(m.title || k, k));
    pick.value = k;
    setScenarioMeta(m);
    api.hideSummary?.();
    paintTransport();
  });
  bus.on('replay:time', (e) => {
    if (e.duration && Math.abs(e.duration - duration) > 0.5) setScenarioMeta({ chapters, duration: e.duration });
    if (!scrubbing) { range.value = e.t; paintTime(e.t); }
  });
  bus.on('replay:seeked', (e) => { if (!scrubbing) { range.value = e.t; paintTime(e.t); } paintTransport(); });
  bus.on('replay:reset', () => { range.value = 0; paintTime(0); });
  ['replay:play', 'replay:pause', 'clock:pause', 'clock:speed', 'replay:end'].forEach((e) => bus.on(e, paintTransport));
  bus.on('replay:end', () => { playB.textContent = '▶'; api.showSummary?.(); });

  range.addEventListener('pointerdown', () => { scrubbing = true; });
  range.addEventListener('input', () => paintTime(+range.value));
  range.addEventListener('change', () => { scrubbing = false; ctx.replay?.seek?.(+range.value); if (!clock.paused) ctx.replay?.play?.(); paintTransport(); });
  addEventListener('pointerup', () => { scrubbing = false; });
  ticks.addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) { ctx.replay?.seek?.(+t.dataset.t); } });

  async function loadScenario(key, { quiet } = {}) {
    if (key === 'free') {
      ctx.director?.reset?.(); ctx.director?.setAmbient?.(true);
      chapters = []; duration = 0; setScenarioMeta({ chapters: [], duration: 0 });
      bus.emit('ui:scenario', { title: '' });
      clock.play(); paintTransport(); return true;
    }
    const sc = await ctx.replay?.load?.(key);
    if (!sc) {
      if (!quiet) api.toast(`That scenario isn’t available yet — try another.`, { kind: 'warn' });
      pick.value = ID_TO_KEY[ctx.replay?.scenario?.id] || 'free';
      return false;
    }
    bus.emit('ui:scenario', { title: sc.title });
    ctx.replay.play(); paintTransport(); return true;
  }
  pick.addEventListener('change', () => { demo = false; loadScenario(pick.value); });
  rc.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r === 'toggle') { ctx.replay ? ctx.replay.toggle() : clock.toggle(); paintTransport(); }
    else if (b.dataset.r === 'restart') { api.hideSummary?.(); ctx.replay?.seek?.(0); ctx.replay?.play?.(); }
    else if (b.dataset.sp) { ctx.replay?.setSpeed ? ctx.replay.setSpeed(+b.dataset.sp) : clock.setSpeed(+b.dataset.sp); }
    else if (b.dataset.r === 'demo') await toggleDemo();
  });
  async function toggleDemo() {
    if (demo) { demo = false; await loadScenario('free'); return; }
    api.hideSummary?.();
    let ok = false;
    for (const k of ['full', 'review', 'intake']) { if (await loadScenario(k, { quiet: true })) { ok = true; pick.value = k; break; } }
    if (!ok) { api.toast('Demo scenarios aren’t ready yet.', { kind: 'warn' }); return; }
    demo = true;
    store.toggleRoutine('camera', true);
    cam()?.setClean(false); cam()?.setView('all');
    if (innerWidth >= 1500) feeds.slack.setOpen(true);
    clock.setSpeed(1);
    api.toast('Demo mode — sit back, the team will take it from here.', { kind: 'good' });
    paintTransport();
  }
  paintTransport();

  // ------------------------------------------------------------------ command box
  const cmd = $('command-box');
  cmd.innerHTML = `<div class="hist" aria-live="polite"></div>
    <div class="chips">${SUGGEST.map((s) => `<button type="button" class="sug" data-sug="${esc(s)}">${esc(s.length > 34 ? s.slice(0, 33) + '…' : s)}</button>`).join('')}</div>
    <div class="crow"><input id="command-input" aria-label="Command" placeholder="Tell the team… e.g. 'tell Muse to draw the bet365 logo on the lobby wall'" maxlength="240"><button class="btn primary" type="submit">Send</button></div>`;
  const input = cmd.querySelector('input'), hist = cmd.querySelector('.hist');
  trapKeys(input);
  const past = []; let pi = 0;
  function addHist(text, state, summary) {
    let row = [...hist.children].find((r) => r.dataset.text === text && r.dataset.state === 'pending');
    if (!row) { row = h('div.hrow', { dataset: { text, state } }); hist.append(row); while (hist.children.length > 3) hist.firstChild.remove(); }
    row.dataset.state = state;
    row.innerHTML = `<span class="y">You</span> ${esc(text)} <span class="res ${state}">${state === 'pending' ? '…' : state === 'ok' ? '✓ ' + esc(summary || 'done') : '✕ ' + esc(summary || 'not understood')}</span>`;
    clearTimeout(row._t); row._t = setTimeout(() => row.classList.add('old'), 25000);
  }
  bus.on('command:submitted', ({ text }) => addHist(text, 'pending'));
  bus.on('command:result', ({ text, ok, summary }) => addHist(text, ok === false ? 'bad' : 'ok', summary));
  async function submit(text) {
    text = text.trim(); if (!text) return;
    past.push(text); pi = past.length;
    if (!ctx.director?.command) { addHist(text, 'bad', 'director offline'); return; }
    let seen = false; const off = bus.once('command:submitted', () => { seen = true; });
    try { await ctx.director.command(text); } catch (e) { console.error(e); addHist(text, 'bad', 'something went wrong'); }
    off?.();
    if (!seen) addHist(text, 'ok', 'sent');
  }
  cmd.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; submit(t); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && past.length) { pi = Math.max(0, pi - 1); input.value = past[pi]; e.preventDefault(); }
    else if (e.key === 'ArrowDown' && past.length) { pi = Math.min(past.length, pi + 1); input.value = past[pi] || ''; e.preventDefault(); }
    else if (e.key === 'Escape') input.blur();
  });
  cmd.addEventListener('click', (e) => { const s = e.target.closest('[data-sug]'); if (s) submit(s.dataset.sug); });

  // ------------------------------------------------------------------ drawers (< 1100px)
  const dt = $('drawer-toggles');
  dt.innerHTML = `<button data-dr="left">Status</button><button data-dr="right">Agents</button><button data-dr="activity">Activity</button>`;
  dt.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dr]'); if (!b) return;
    const cls = 'drawer-' + b.dataset.dr;
    const was = body.classList.contains(cls);
    body.classList.remove('drawer-left', 'drawer-right', 'drawer-activity'); if (!was) body.classList.add(cls); bus.emit('ui:layout', {});
  });
  $('left-col').addEventListener('click', (e) => { if (innerWidth < 1100 && e.target.closest('[data-floor],[data-ask]')) { body.classList.remove('drawer-left'); } });
  $('needs-card').addEventListener('click', () => body.classList.remove('drawer-left', 'drawer-right', 'drawer-activity'));
  $('right-col').addEventListener('click', (e) => { if (innerWidth < 1100 && e.target.closest('[data-agent]')) { body.classList.remove('drawer-right'); } });

  // ------------------------------------------------------------------ keyboard
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target)) { if (e.key === 'Escape') e.target.blur(); return; }
    const c = cam();
    const k = e.key;
    if ((k >= '1' && k <= '4') || 'aAcC'.includes(k)) c?.markUser?.();
    if (k >= '1' && k <= '4') c?.setView({ type: 'floor', floor: +k - 1 });
    else if (k === 'a' || k === 'A') c?.setView('all');
    else if (k === 'c' || k === 'C') c?.setClean(!c.isClean());
    else if (k === 'm' || k === 'M') api.openProjectMap();
    else if (k === 's' || k === 'S') feeds.slack.toggle();
    else if (k === '/') { e.preventDefault(); input.focus(); }
    else if (k === ' ' && (e.target === document.body || e.target.closest?.('#stage'))) { e.preventDefault(); ctx.replay ? ctx.replay.toggle() : clock.toggle(); paintTransport(); }
    else if (k === 'Escape') {
      if (api.escape?.()) return;
      const v = c?.getView?.();
      if (/drawer-/.test(body.className)) body.classList.remove('drawer-left', 'drawer-right', 'drawer-activity');
      else if (v?.type === 'desk') api.closeDeskView();
      else if (v?.type === 'floor') c.setView('all');
      else if (c?.isClean?.()) c.setClean(false);
    }
  });

  // ------------------------------------------------------------------ camera insets: keep 3D content clear of the panels
  let last = '';
  function applyInsets() {
    const c = cam(); if (!c?.setInsets) return;
    let ins = { left: 0, right: 0, top: 0, bottom: 0 };
    if (body.classList.contains('clean')) {
      const navR = nav.offsetParent !== null ? nav.getBoundingClientRect() : null;
      ins.bottom = Math.round(innerHeight - (navR?.top ?? innerHeight) + 6); // keep the floating nav clear of the model
    } else {
      const W = innerWidth, H = innerHeight, wide = W >= 1100;
      const r = (el) => (el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
      const hint = $('controls-hint'), needsEl = $('needs-card');
      const lowest = (...els) => Math.max(0, ...els.map((e) => r(e)?.bottom || 0));
      const topmost = (...els) => Math.min(H, ...els.map((e) => r(e)?.top ?? H));
      ins.top = Math.round(lowest($('top-pill'), needsEl, wide ? null : brand) + 6);
      const cmdR = r(cmd);
      const cmdTop = cmdR ? cmdR.top + (hist.offsetHeight ? hist.offsetHeight + 6 : 0) : H; // command history rows float above; don't re-fit for them
      ins.bottom = Math.round(H - Math.min(cmdTop, topmost(nav, hint, rc, wide ? null : dt)) + 6);
      if (wide) {
        const l = r($('left-panel')), rp = r($('right-col')), sl = body.classList.contains('slack-open') ? r($('slack-col')) : null;
        ins.left = Math.round((l?.right || 0) + 8);
        ins.right = Math.round(W - Math.min(rp?.left ?? W, sl?.left ?? W) + 8);
      }
    }
    const sig = JSON.stringify(ins);
    if (sig !== last) {
      const first = !last;
      last = sig; c.setInsets(ins);
      // re-fit the current view to the new free area (unless the human is steering or we're in desk view)
      const v = c.getView?.();
      if (v && v.type !== 'desk' && !(c.userActive?.(4) && !first)) c.setView(v, first ? { animate: false } : { duration: 0.4 });
    }
  }
  const soon = () => setTimeout(applyInsets, 0);
  addEventListener('resize', soon);
  ['cam:clean', 'ui:layout', 'app:ready', 'cam:view'].forEach((e) => bus.on(e, soon));
  if (window.ResizeObserver) { const ro = new ResizeObserver(soon); [cmd, rc, $('top-pill'), $('needs-card'), $('left-panel')].forEach((el) => el && ro.observe(el)); }
  soon();
  setTimeout(applyInsets, 400);

  return { markNav, paintTransport, applyInsets, loadScenario, get demo() { return demo; }, focusCommand: () => input.focus() };
}
