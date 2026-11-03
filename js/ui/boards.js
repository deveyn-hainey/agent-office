// Boards (zoom & readability): click a board-like surface -> camera flies to it + a crisp 2D lightbox of its current state,
// prev/next cycling, "updated" glow dots, a Boards list with last-updated times + unread badges, and "Follow updates".
// Purely local: reads world.surfaces state and bus 'surface:update' events; never sends anything anywhere.
import { esc } from '../core/util.js';
import { $, h } from './dom.js';

const LABELS = {
  'board-4f': 'Planning whiteboard', 'vote-4f': '#decisions board', 'screen-3f-a': 'Conference Room A screen',
  'screen-3f-b': 'Conference Room B screen', 'cork-3f': 'Evidence corkboard (sticky notes)', 'board-2f': 'Team whiteboard',
  'jira-2f': 'Jira board', 'ci-2f': 'CI wall', 'xray-2f': 'Repo X-Ray', 'mural-1f': 'Lobby mural', 'slack-1f': 'Team chat screen',
};
const FRESH_MS = 60e3;
const FOLLOW_GAP_MS = 8e3;
const LS_FOLLOW = 'office.followUpdates';

const ago = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const txt = (v) => (v == null ? '' : typeof v === 'object' ? String(v.text ?? v.title ?? v.label ?? '') : String(v));

export function createBoards(ctx, store) {
  const { bus, clock } = ctx;
  const W = () => ctx.world;
  const cam = () => ctx.cam || ctx.scene?.cam;
  const T = ctx.scene.THREE;
  const ids = () => W()?.surfaces?.list?.() || [];
  const def = (id) => W()?.surface?.(id) || null;
  const label = (id) => LABELS[id] || def(id)?.label || id;
  const floorOf = (id) => def(id)?.floor ?? 0;
  const who = (id) => (id ? store.agent(id)?.short || id : '');

  const meta = new Map(); // id -> { updated: ms|0, unread: n, viewed: ms }
  const M = (id) => { if (!meta.has(id)) meta.set(id, { updated: 0, unread: 0 }); return meta.get(id); };
  let quiet = 0; // >0 while a bulk restore (live backfill) runs: changes are timestamped but not counted as unread
  let quietTs = 0; // during a bulk restore: the source time of the event being applied (so "updated 3h ago" is honest)
  let openId = null, follow = localStorage.getItem(LS_FOLLOW) === '1', lastFollow = 0, burst = 0;

  /* ------------------------------------------------------------ 3D "updated" dots (CSS2D) */
  const dots = new Map();
  let upTo = 3;
  function worldPos(id) {
    const d = def(id); if (!d) return null;
    return { x: d.x, y: ctx.scene.floorY(d.floor) + d.y, z: d.z };
  }
  function ensureDot(id) {
    if (dots.has(id)) return dots.get(id);
    const p = worldPos(id); if (!p) return null;
    const d = def(id);
    const el = h('div.bd-dot', { title: `${label(id)} updated` });
    el.addEventListener('click', (e) => { e.stopPropagation(); open(id); });
    const o = ctx.scene.css2d(el);
    // top-right corner of the board face (boards face +z when rot≈0, +x when rot≈π/2)
    const side = (d.w || 6) / 2 - 0.3, top = (d.h || 4) / 2 + 0.35;
    const rot = +d.rot || 0;
    o.position.set(p.x + Math.cos(rot) * side, p.y + top, p.z - Math.sin(rot) * side);
    ctx.scene.scene.add(o);
    const rec = { el, o };
    dots.set(id, rec);
    return rec;
  }
  function paintDots() {
    const now = Date.now();
    for (const id of ids()) {
      const m = meta.get(id);
      const fresh = m && m.updated && now - m.updated < FRESH_MS;
      const rec = fresh || dots.has(id) ? ensureDot(id) : null;
      if (!rec) continue;
      const show = !!fresh && floorOf(id) <= upTo && !document.body.classList.contains('clean');
      rec.el.classList.toggle('on', show);
      rec.o.visible = show;
    }
  }
  bus.on('world:floors', (e) => { upTo = e?.upTo ?? 3; paintDots(); });

  /* ------------------------------------------------------------ change tracking */
  bus.on('surface:update', ({ id }) => {
    if (!id) return;
    const m = M(id);
    m.updated = quiet && quietTs ? Math.min(Date.now(), quietTs) : Date.now();
    if (openId !== id && !clock.seeking && !quiet) m.unread++;
    paintDots(); renderList();
    if (openId === id) renderBox();
    burst++;
    setTimeout(() => { burst = Math.max(0, burst - 1); }, 1500);
    const cv = cam()?.getView?.();
    if (follow && cv?.type !== 'desk' && !clock.seeking && !quiet && openId !== id && burst < 6 && Date.now() - lastFollow > FOLLOW_GAP_MS) {
      lastFollow = Date.now();
      fly(id);
      bus.emit('toast', { text: `${label(id)} updated`, kind: 'info' });
    }
  });
  const clearAll = () => { meta.clear(); paintDots(); renderList(); if (openId) renderBox(); };
  bus.on('replay:reset', clearAll);

  /* ------------------------------------------------------------ camera */
  function fly(id) {
    const p = worldPos(id), d = def(id); if (!p) return;
    const c = cam(); if (!c) return;
    if (c.focusPoint) c.focusPoint(p, { w: d.w, h: d.h, id, floor: d.floor });
    else c.setView({ type: 'floor', floor: d.floor });
  }

  /* ------------------------------------------------------------ lightbox */
  const box = h('div#board-lightbox.ui-overlay', { hidden: true, role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Board close-up' });
  ($('ui-root') || document.body).append(box);
  function open(id) {
    if (!def(id)) return;
    openId = id;
    const m = M(id); m.unread = 0;
    fly(id);
    box.hidden = false;
    renderBox(); renderList();
    bus.emit('board:open', { id });
  }
  function close() { if (!openId) return false; openId = null; box.hidden = true; box.innerHTML = ''; box._sig = ''; renderList(); return true; }
  function cycle(d) {
    const list = ids(); if (!list.length) return;
    const i = Math.max(0, list.indexOf(openId));
    open(list[(i + d + list.length) % list.length]);
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]'); if (!b) return;
    if (b.dataset.lb === 'close') close();
    else if (b.dataset.lb === 'prev') cycle(-1);
    else if (b.dataset.lb === 'next') cycle(1);
  });

  function body(id, kind, st) {
    const li = (items) => (items.length ? `<ul>${items.join('')}</ul>` : '');
    const empty = '<p class="lb-empty">Nothing on this board yet.</p>';
    switch (kind) {
      case 'whiteboard': {
        const req = arr(st.requests).map((r) => `<li><b>${esc(r.who || '')}</b> ${esc(txt(r))}</li>`);
        const steps = arr(st.steps).map((s) => `<li class="${s.done ? 'done' : ''}"><span class="n">${esc(s.n ?? '')}</span> ${esc(txt(s))}${s.done ? ' <em>✓</em>' : ''}</li>`);
        const cards = arr(st.cards).map((c) => `<div class="lb-card sev-${esc(c.status || '')}"><div class="k">${esc(c.key || '')}${c.status ? ` · ${esc(c.status)}` : ''}</div><b>${esc(c.title || '')}</b><div class="m">${esc(who(c.owner))}${c.scope ? ` · <code>${esc(c.scope)}</code>` : ''}</div></div>`);
        const notes = arr(st.notes).map((n) => `<li>${esc(txt(n))}</li>`);
        const cols = arr(st.columns).map((col) => `<div class="lb-col"><h4>${esc(col.title || '')}</h4>${li(arr(col.items).map((i) => `<li>${esc(txt(i))}</li>`))}</div>`);
        const out = (req.length ? `<h4>Requests</h4>${li(req)}` : '') + (steps.length ? `<h4>Plan</h4><ol class="lb-steps">${steps.join('')}</ol>` : '')
          + (cards.length ? `<h4>Cards</h4><div class="lb-cards">${cards.join('')}</div>` : '') + (notes.length ? `<h4>Notes</h4>${li(notes)}` : '')
          + (cols.length ? `<div class="lb-cols">${cols.join('')}</div>` : '');
        return out || empty;
      }
      case 'voteboard': {
        const p = arr(st.proposals).map((x) => {
          const votes = Object.entries(x.votes || {}).map(([a, v]) => `<span class="vote ${esc(v)}">${esc(who(a))} ${v === 'yes' ? '👍' : v === 'no' ? '👎' : esc(v)}</span>`).join(' ');
          return `<div class="lb-card${x.locked ? ' locked' : ''}"><div class="k">${esc(x.id || '')}${x.locked ? ' · 🔒 locked' : ''}</div><b>${esc(x.text || '')}</b><div class="m">YES ${+x.yes || 0} · NO ${+x.no || 0} ${votes}</div></div>`;
        });
        return p.length ? `<div class="lb-cards one">${p.join('')}</div>` : empty;
      }
      case 'jira': {
        const COLS = [['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']];
        const cards = arr(st.cards);
        if (!cards.length) return empty;
        return `<div class="lb-cols">${COLS.map(([k, t]) => `<div class="lb-col"><h4>${t} <em>${cards.filter((c) => c.col === k).length}</em></h4>${cards.filter((c) => c.col === k).map((c) => `<div class="lb-card"><div class="k">${esc(c.key || '')}</div><b>${esc(c.title || '')}</b><div class="m">${esc(who(c.owner))}</div></div>`).join('')}</div>`).join('')}</div>`;
      }
      case 'ciwall': {
        const jobs = arr(st.jobs).map((j) => `<li class="ci ${esc(j.status || '')}"><span class="st">${esc(j.status || '')}</span> <b>${esc(j.name || '')}</b>${j.note ? ` — ${esc(j.note)}` : ''}</li>`);
        return `<p class="lb-sub">${esc(st.badge || 'CI')} · overall <b class="ci ${esc(st.status || 'idle')}">${esc(st.status || 'idle')}</b></p>` + (jobs.length ? `<ul class="lb-ci">${jobs.join('')}</ul>` : empty);
      }
      case 'confscreen': {
        const f = arr(st.findings).map((x) => `<li class="sev-${esc(String(x.sev || '').toLowerCase())}"><span class="st">${esc(String(x.sev || 'note').toUpperCase())}</span> ${esc(x.text || '')}${x.file ? ` <code>${esc(x.file)}</code>` : ''}</li>`);
        return (st.agent ? `<p class="lb-sub">Presenting: <b>${esc(who(st.agent))}</b></p>` : '') + (f.length ? `<ul class="lb-ci">${f.join('')}</ul>` : empty);
      }
      case 'corkboard': {
        const n = arr(st.notes).map((x) => `<div class="lb-sticky">${esc(txt(x))}</div>`);
        return n.length ? `<div class="lb-stickies">${n.join('')}</div>` : empty;
      }
      case 'xray': {
        const hi = new Set(arr(st.highlight));
        const n = arr(st.nodes).map((x) => `<span class="lb-node${hi.has(x.id) ? ' hot' : ''}">${esc(x.label || x.id)}</span>`);
        const e = arr(st.edges).map((x) => `<li>${esc(Array.isArray(x) ? x.join(' → ') : `${x.from ?? x.a ?? ''} → ${x.to ?? x.b ?? ''}`)}</li>`);
        return n.length ? `<div class="lb-nodes">${n.join('')}</div>${e.length ? `<h4>Dependencies</h4>${li(e)}` : ''}` : empty;
      }
      case 'slack': {
        const m = arr(st.messages).slice(-14).map((x) => `<li><b>${esc(x.who || '')}</b> ${esc(x.text || '')}</li>`);
        return (st.channel ? `<p class="lb-sub">#${esc(String(st.channel).replace(/^#/, ''))}</p>` : '') + (m.length ? `<ul class="lb-chat">${m.join('')}</ul>` : empty);
      }
      case 'mural': {
        const b = st.badge; const t = typeof b === 'string' ? b : b?.text;
        return t ? `<div class="lb-mural" style="--c:${/^#[0-9a-f]{3,8}$/i.test(b?.color || '') ? b.color : '#3d7be0'}">${esc(t)}</div>` : empty;
      }
      default: return `<pre>${esc(JSON.stringify(st, null, 2))}</pre>`;
    }
  }
  function renderBox() {
    if (!openId) return;
    const d = def(openId) || {};
    const st = W()?.surfaces?.get?.(openId) || {};
    const m = M(openId);
    const list = ids(), i = list.indexOf(openId);
    const title = st.title ? txt(st.title) : '';
    const html = `<div class="lb card"><header><div><span class="lb-floor">${(d.floor ?? 0) + 1}F</span><h3>${esc(label(openId))}</h3>${title ? `<div class="lb-title">${esc(title)}</div>` : ''}</div>
      <span class="lb-upd${m.updated && Date.now() - m.updated < FRESH_MS ? ' fresh' : ''}">${m.updated ? `updated ${ago(m.updated)}` : 'no changes yet'}</span>
      <div class="lb-nav"><button class="btn small" data-lb="prev" aria-label="Previous board" title="Previous board (←)">‹</button><span>${i + 1}/${list.length}</span><button class="btn small" data-lb="next" aria-label="Next board" title="Next board (→)">›</button><button class="btn small ghost" data-lb="close" aria-label="Close" title="Close (Esc)">✕</button></div></header>
      <div class="lb-body">${body(openId, d.kind, st)}</div></div>`;
    if (box._sig !== html) {
      const prev = box.querySelector('.lb-body'), top = prev && box._sigId === openId ? prev.scrollTop : 0;
      const focusKey = document.activeElement?.closest?.('#board-lightbox [data-lb]')?.dataset.lb;
      box._sig = html; box._sigId = openId; box.innerHTML = html;
      const nb = box.querySelector('.lb-body'); if (nb) nb.scrollTop = top;
      if (focusKey) box.querySelector(`[data-lb="${focusKey}"]`)?.focus();
    }
  }

  /* ------------------------------------------------------------ Boards list (left column) */
  const card = h('section#boards-card.card.sec.coll', { 'data-sec': 'boards' });
  const col = $('left-col');
  if (col) col.append(card);
  let listOpen = localStorage.getItem('office.boardsOpen') !== '0';
  function renderList() {
    const now = Date.now();
    const list = ids();
    const unreadTotal = list.reduce((n, id) => n + (meta.get(id)?.unread || 0), 0);
    const rows = list.map((id) => {
      const m = meta.get(id) || {};
      const fresh = m.updated && now - m.updated < FRESH_MS;
      return `<button class="brow${openId === id ? ' on' : ''}${fresh ? ' fresh' : ''}" data-board="${esc(id)}"><span class="fnum">${floorOf(id) + 1}</span><span class="bmid"><b>${esc(label(id))}</b><small>${m.updated ? ago(m.updated) : '—'}</small></span>${m.unread ? `<em class="bunread">${m.unread}</em>` : ''}</button>`;
    }).join('');
    const html = `<button class="coll-h" data-btoggle="1"><span class="t">Boards</span>${unreadTotal ? `<em class="count warn">${unreadTotal}</em>` : `<em class="count">${list.length}</em>`}</button>
      <div class="coll-b"${listOpen ? '' : ' hidden'}><label class="routine"><span><b>Follow updates</b><small>Fly to a board when it changes</small></span><input type="checkbox" class="sw" data-follow ${follow ? 'checked' : ''}><i class="swi"></i></label><div class="blist">${rows}</div></div>`;
    if (card._html !== html) {
      const lst = card.querySelector('.blist'), top = lst ? lst.scrollTop : 0, f = document.activeElement && card.contains(document.activeElement);
      const fk = f ? (document.activeElement.dataset.board ? `[data-board="${document.activeElement.dataset.board}"]` : document.activeElement.matches('[data-follow]') ? '[data-follow]' : null) : null;
      card._html = html; card.innerHTML = html;
      const nl = card.querySelector('.blist'); if (nl) nl.scrollTop = top;
      if (fk) card.querySelector(fk)?.focus();
    }
    card.classList.toggle('open', listOpen);
  }
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-board]'); if (b) { open(b.dataset.board); return; }
    if (e.target.closest('[data-btoggle]')) { listOpen = !listOpen; localStorage.setItem('office.boardsOpen', listOpen ? '1' : '0'); renderList(); }
  });
  card.addEventListener('change', (e) => {
    if (e.target.matches('[data-follow]')) { follow = e.target.checked; localStorage.setItem(LS_FOLLOW, follow ? '1' : '0'); lastFollow = 0; }
  });

  /* ------------------------------------------------------------ input wiring */
  bus.on('surface:click', ({ id }) => open(id));
  // double-click empty floor / furniture: smooth zoom into that spot (boards and agents have their own click actions)
  bus.on('scene:dblclick', ({ clientX, clientY }) => {
    const hit = ctx.scene.pick(clientX, clientY, [...(ctx.agents?.pickables?.() || []), ...(W()?.pickables?.() || [])]);
    if (hit && (hit.pick.type === 'surface' || hit.pick.type === 'agent')) return;
    cam()?.zoomAt?.(clientX, clientY, 2, true);
  });
  addEventListener('keydown', (e) => {
    if (!openId || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); cycle(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); cycle(1); }
  }, true);

  setInterval(() => { paintDots(); renderList(); if (openId) renderBox(); }, 5000);
  renderList();

  const bulk = (on) => { quiet = Math.max(0, quiet + (on ? 1 : -1)); };
  bus.on('boards:quiet', ({ on }) => { bulk(on); if (!on) quietTs = 0; });
  bus.on('boards:clock', ({ ts }) => { quietTs = +ts || 0; });
  return { open, close, cycle, bulk, get openId() { return openId; }, get follow() { return follow; }, setFollow(on) { follow = !!on; localStorage.setItem(LS_FOLLOW, follow ? '1' : '0'); renderList(); }, meta: (id) => ({ ...M(id) }), escape: close };
}
