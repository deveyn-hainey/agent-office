// STUB UI (S4 replaces this folder's contents, keeping the exported contract).
import { STATES, esc, denverHM, denverHMS, mmss } from '../core/util.js';

export function createUI(ctx) {
  const { bus, clock } = ctx;
  const $ = (id) => document.getElementById(id);
  const counts = () => {
    const c = {};
    for (const a of ctx.agents.list()) if (a.visible) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  };

  function renderPill() {
    const c = counts();
    $('top-pill').innerHTML = `<b>Office Bot</b>` + Object.entries(STATES).map(([k, s]) => `<span><i class="dot" style="background:${s.color}"></i>${c[k] || 0} ${s.label.toLowerCase()}</span>`).join('') + `<span id="denver-time">${denverHMS(Date.now())}</span>`;
  }
  renderPill();
  setInterval(() => { const el = $('denver-time'); if (el) el.textContent = denverHMS(Date.now()); }, 1000);
  bus.on('agent:status', renderPill);

  // activity log
  const log = $('activity-log');
  log.innerHTML = '<div class="empty">Activity</div>';
  bus.on('activity', (e) => {
    if (log.firstChild?.className === 'empty') log.innerHTML = '';
    const row = document.createElement('div');
    row.innerHTML = `<time>${denverHM(e.ts)}</time> <b>${esc(ctx.agents.get(e.agent)?.name || e.agent)}</b> ${esc(e.text)}`;
    log.prepend(row);
  });

  // slack pane
  const slack = $('slack-pane');
  slack.innerHTML = '<div class="empty">#pitchside</div>';
  bus.on('slack:message', (m) => {
    const row = document.createElement('div');
    row.innerHTML = `<b>${esc(m.who)}</b> ${esc(m.text)}`;
    slack.append(row);
  });

  // toast + asks
  let toastTimer = 0;
  const toast = (text) => { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 4000); };
  bus.on('toast', (e) => toast(e.text));
  bus.on('ask:open', (a) => {
    $('right-panel').innerHTML = `<div class="card" style="padding:10px"><b>Waiting on me</b><p>${esc(a.text)}</p>${a.options.map((o) => `<button data-ask="${esc(a.id)}" data-choice="${esc(o)}">${esc(o)}</button>`).join(' ')}</div>`;
  });
  bus.on('ask:answer', () => { $('right-panel').innerHTML = ''; });
  $('right-panel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ask]');
    if (b) ctx.director.answer(b.dataset.ask, b.dataset.choice);
  });

  // bottom nav -> camera
  const nav = $('bottom-nav');
  nav.innerHTML = `<button data-v="all">All floors</button><button data-d="-1">‹</button><button data-v="floor">Floor</button><button data-d="1">›</button><button data-v="clean">Clean</button><button data-z="0.8">−</button><button data-z="1.25">+</button>`;
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const cam = ctx.scene.cam;
    if (b.dataset.v === 'all') cam.setView('all');
    else if (b.dataset.v === 'floor') cam.setView({ type: 'floor', floor: cam.getView().floor ?? 0 });
    else if (b.dataset.v === 'clean') cam.setClean(!cam.isClean());
    else if (b.dataset.d) cam.nextFloor(+b.dataset.d);
    else if (b.dataset.z) cam.zoomBy(+b.dataset.z);
  });

  // replay controls
  const rc = $('replay-controls');
  rc.innerHTML = `<button data-r="toggle">▶ / ❚❚</button><span id="rtime">0:00</span>`;
  rc.addEventListener('click', (e) => { if (e.target.closest('[data-r=toggle]')) ctx.replay.toggle(); });
  bus.on('replay:time', (e) => { $('rtime').textContent = `${mmss(e.t)} / ${mmss(e.duration)}`; });

  // command box
  const cmd = $('command-box');
  cmd.innerHTML = `<input id="command-input" placeholder="Tell the team… e.g. huddle everyone" aria-label="Command"><button type="submit">Send</button>`;
  cmd.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('command-input'); const text = inp.value.trim();
    if (!text) return;
    inp.value = '';
    ctx.director.command(text);
  });

  // clicking things in the world
  bus.on('agent:click', ({ id }) => ctx.scene.cam.setView({ type: 'desk', agent: id }));

  return { toast, openBinder() {}, openDeskView(id) { ctx.scene.cam.setView({ type: 'desk', agent: id }); }, closeDeskView() { ctx.scene.cam.setView('all'); }, openProjectMap() {} };
}
