import { STATES, ACTIVE, colorFor, esc, truncate, denverHM, denverFull, relative } from './util.js';

const $ = (id) => document.getElementById(id);
const STALE_MS = 2 * 3600 * 1000;
const S = { floors: [], agents: [], routines: [], activity: [], usage: null, updated: null, active: 0 };
let scene = null;

async function getJSON(path, optional) {
  try {
    const r = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    if (optional) return null;
    throw e;
  }
}

async function load() {
  const [floors, agents, status, activity, routines, usage] = await Promise.all([
    getJSON('../data/floors.json', true), getJSON('../data/agents.json'), getJSON('../data/status.json', true),
    getJSON('../data/activity.json', true), getJSON('../data/routines.json', true), getJSON('../data/usage.json', true),
  ]);
  S.floors = Array.isArray(floors) && floors.length ? floors : [{ id: 'main', name: 'Office' }];
  const st = (status && status.agents) || {};
  S.agents = (agents || []).map((a) => {
    const fi = S.floors.findIndex((f) => f.id === a.floor);
    const s = st[a.id] || {};
    const state = STATES[s.state] ? s.state : 'idle';
    const o = { ...a, floor: fi < 0 ? 0 : fi, state, task: s.task || '', updated: s.updated || (status && status.updated) || null };
    o.colorHex = colorFor(a);
    return o;
  });
  S.updated = (status && status.updated) || null;
  S.activity = Array.isArray(activity) ? activity : [];
  S.routines = Array.isArray(routines) ? routines : [];
  S.usage = usage && (Array.isArray(usage) ? usage.length : Object.keys(usage).length) ? usage : null;
  if (S.active >= S.floors.length) S.active = 0;
}

const byId = (id) => S.agents.find((a) => a.id === id);
const dot = (c) => `<i class="dot" style="background:${c}"></i>`;
const count = (st) => S.agents.filter((a) => a.state === st).length;

/* ---------- render ---------- */
function renderHeader() {
  const stale = !S.updated || Date.now() - new Date(S.updated).getTime() > STALE_MS;
  $('updated').textContent = S.updated ? denverHM(S.updated) : '--:--';
  $('live').classList.toggle('is-stale', stale);
  $('liveLabel').textContent = stale ? 'Stale' : 'Live';
  const el = $('stale');
  el.hidden = !stale;
  if (stale) el.textContent = S.updated ? `Status is stale · last update ${relative(S.updated)}` : 'No status data yet';
}

function renderCounts() {
  const items = [['working', 'working', count('working')], ['needs-you', 'waiting', count('needs-you')], ['stuck', 'errors', count('stuck')], ['finished', 'finished', count('finished')], ['idle', 'resting', count('idle')]];
  $('counts').innerHTML = items.map(([st, l, n]) => `<span>${dot(STATES[st].color)}<b>${n}</b> ${l}</span>`).join('');
  const w = S.agents.find((a) => a.state === 'needs-you');
  const t = $('toast');
  t.hidden = !w;
  document.body.classList.toggle('has-toast', !!w);
  const nw = count('needs-you');
  document.title = (nw ? `(${nw}) ` : '') + 'Office Bot';
  if (w) {
    const more = count('needs-you') - 1;
    t.innerHTML = `<span class="sq" style="background:${w.colorHex}"></span><div class="tt"><b>${esc(w.name)} needs you</b><small>${esc(truncate(w.task, 48) || 'Waiting on you')}${more ? ` · +${more} more` : ''}</small></div><button class="btn" data-view="${esc(w.id)}">View</button>`;
  }
}

function floorStats(i) {
  const l = S.agents.filter((a) => a.floor === i);
  return { list: l, active: l.filter((a) => ACTIVE.includes(a.state)).length };
}

function renderFloors() {
  $('floorCount').textContent = S.floors.length;
  let h = '';
  for (let i = S.floors.length - 1; i >= 0; i--) {
    const { list, active } = floorStats(i);
    h += `<button class="frow${i === S.active ? ' on' : ''}" data-floor="${i}"><span class="num">${i + 1}</span><span class="fn"><b>${esc(S.floors[i].name)}</b><span class="dots">${list.map((a) => dot(STATES[a.state].color)).join('')}</span></span><span class="fc">${active}/${list.length}</span></button>`;
  }
  $('floorList').innerHTML = h;
}

function agentRow(a, sub) {
  return `<button class="arow" data-agent="${esc(a.id)}"><span class="sq" style="background:${a.colorHex}33"><i style="background:${a.colorHex}"></i></span><span class="at"><b>${esc(a.name)}</b><small>${sub}</small></span></button>`;
}

function renderLists() {
  const w = S.agents.filter((a) => a.state === 'needs-you');
  $('waitBadge').textContent = w.length;
  $('waitBadge').classList.toggle('hot', w.length > 0);
  $('waitBody').innerHTML = w.length ? w.map((a) => agentRow(a, esc(truncate(a.task, 40)))).join('') : '<div class="empty">Nothing needs you</div>';
  const f = S.agents.filter((a) => a.state === 'finished');
  $('finBadge').textContent = f.length;
  $('finBody').innerHTML = f.length ? f.map((a) => agentRow(a, esc(truncate(a.task, 40)))).join('') : '<div class="empty">Nothing finished yet</div>';
  const rs = S.routines.filter((r) => r && r.name);
  $('cRou').hidden = !rs.length;
  $('rouBadge').textContent = rs.length;
  $('rouBody').innerHTML = rs.map((r) => `<div class="rrow"><b>${esc(r.name)}</b><small>${esc(r.schedule || '')}${r.agent ? ` · ${esc(byId(r.agent)?.name || r.agent)}` : ''}</small></div>`).join('');
}

function renderRight() {
  const { list, active } = floorStats(S.active);
  $('bName').textContent = S.floors[S.active].name;
  $('bWorking').textContent = list.filter((a) => a.state === 'working').length;
  $('bSub').textContent = `${S.floors.length > 1 ? `Floor ${S.active + 1} · ` : ''}${list.length} bot${list.length === 1 ? '' : 's'}`;
  $('agentList').innerHTML = list.length
    ? list.map((a) => agentRow(a, `${STATES[a.state].label}${a.task ? ' · ' + esc(truncate(a.task, 60)) : ''}`)).join('')
    : '<div class="empty">No agents on this floor</div>';
}

function renderActivity() {
  const items = S.activity.slice(0, 8);
  $('actList').innerHTML = items.length
    ? items.map((x) => `<div class="act"><time>${denverHM(x.time)}</time><span><b>${esc(byId(x.agent)?.name || x.agent || '')}</b> · ${esc(truncate(x.text, 70))}</span></div>`).join('')
    : '<div class="empty">No activity yet</div>';
}

function renderUsage() {
  const el = $('usage');
  const blocks = S.usage ? (Array.isArray(S.usage) ? S.usage : [S.usage]) : [];
  el.hidden = !blocks.length;
  const pal = ['#f2c94c', '#4c8dff', '#9b6bff', '#ef5da8', '#3cc8b4', '#ff8a4c'];
  const pct = (v) => (v == null || v === '' ? '' : typeof v === 'number' ? `${Math.round(v * 10) / 10}%` : esc(v));
  el.innerHTML = blocks.map((u) => {
    const p = parseFloat(u.percent);
    return `<div class="ublock"><div class="urow"><span>${esc(u.label || 'Usage')}</span><span>${u.resets ? 'Resets ' + esc(u.resets) : ''}</span></div>
      <div class="ubig"><b>${pct(u.percent)}</b><small>${esc(u.used || (u.percent != null ? 'used' : ''))}</small></div>
      ${isNaN(p) ? '' : `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`}
      ${(u.items || []).map((it, i) => `<div class="urow it"><span>${dot(it.color || pal[i % pal.length])}${esc(it.name)}</span><span>${pct(it.percent)}</span></div>`).join('')}</div>`;
  }).join('');
}

function renderAll() {
  const single = S.floors.length < 2;
  document.body.classList.toggle('single-floor', single);
  $('navLeft').textContent = single ? 'Status' : 'Floors';
  renderHeader(); renderCounts(); renderFloors(); renderLists(); renderRight(); renderActivity(); renderUsage();
  if (scene) scene.setData(S.floors, S.agents);
  if (openId) renderDetail();
}

/* ---------- details ---------- */
let openId = null;
function renderDetail() {
  const a = byId(openId);
  if (!a) return closeDetail();
  $('detail').innerHTML = `<button class="x" data-close aria-label="Close">×</button>
    <div class="dh"><span class="sq big" style="background:${a.colorHex}"></span><div><b>${esc(a.name)}</b><span class="chip" style="background:${STATES[a.state].color}">${STATES[a.state].label}</span></div></div>
    <dl><dt>Source</dt><dd>${esc(a.source || '—')}</dd><dt>Role</dt><dd>${esc(a.role || '—')}</dd><dt>Floor</dt><dd>${a.floor + 1} · ${esc(S.floors[a.floor].name)}</dd>
    <dt>Task</dt><dd>${esc(a.task || '—')}</dd><dt>Updated</dt><dd>${a.updated ? esc(denverFull(a.updated)) + ' <small>(' + relative(a.updated) + ')</small>' : '—'}</dd></dl>`;
  $('detail').hidden = false;
  $('detailBack').hidden = false;
}
function openAgent(id, switchFloor) {
  const a = byId(id);
  if (!a) return;
  openId = id;
  if (switchFloor && a.floor !== S.active) selectFloor(a.floor);
  renderDetail();
}
function closeDetail() {
  openId = null;
  $('detail').hidden = true;
  $('detailBack').hidden = true;
}

function selectFloor(i) {
  i = Math.max(0, Math.min(S.floors.length - 1, i));
  S.active = i;
  renderFloors(); renderRight();
  scene?.setFloor(i);
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  const fl = t.closest('[data-floor]');
  if (fl) { selectFloor(+fl.dataset.floor); if (innerWidth < 768) closeDrawers(); return; }
  const ag = t.closest('[data-agent]');
  if (ag) { openAgent(ag.dataset.agent, true); if (innerWidth < 768) closeDrawers(); return; }
  const v = t.closest('[data-view]');
  if (v) return openAgent(v.dataset.view, true);
  if (t.closest('[data-close]') || t.id === 'detailBack') return closeDetail();
  const ch = t.closest('.chead');
  if (ch) return ch.parentElement.classList.toggle('open');
  const nav = t.closest('#mnav button');
  if (nav) {
    const el = $(nav.dataset.d), was = el.classList.contains('drawer-open');
    closeDrawers();
    if (!was) el.classList.add('drawer-open');
    return;
  }
  if (t.closest('#stage')) closeDrawers();
});
function closeDrawers() { document.querySelectorAll('.drawer-open').forEach((e) => e.classList.remove('drawer-open')); }

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeDetail(); closeDrawers(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectFloor(S.active + 1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); selectFloor(S.active - 1); }
});

let touring = false;
$('tour').addEventListener('click', () => {
  touring = !touring;
  $('tour').setAttribute('aria-pressed', touring);
  $('tour').classList.toggle('on', touring);
  $('tourIcon').textContent = touring ? '■' : '▶';
  scene?.setTour(touring);
});
$('zin').addEventListener('click', () => scene?.zoomBy(1.2));
$('zout').addEventListener('click', () => scene?.zoomBy(1 / 1.2));

/* ---------- boot ---------- */
async function boot() {
  try { await load(); } catch (e) {
    $('counts').textContent = 'Could not load data/agents.json';
    console.error(e);
    return;
  }
  renderAll();
  try {
    const { createScene } = await import('./scene.js');
    scene = createScene($('stage'), { onSelect: (id) => openAgent(id, false) });
    scene.setData(S.floors, S.agents);
    scene.setFloor(S.active, false);
  } catch (e) {
    console.error(e);
    window.aoFail();
  }
  setInterval(async () => {
    try { await load(); renderAll(); } catch (e) { console.warn('refresh failed', e); }
  }, 60000);
  setInterval(() => { renderHeader(); if (openId) renderDetail(); }, 30000);
}
boot();
