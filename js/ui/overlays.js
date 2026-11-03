// Toasts, binder modal, project-map overlay and the end-of-demo summary card.
import { STATES, esc, truncate, denverHM, mmss } from '../core/util.js';
import { $, h, avatarHTML } from './dom.js';

const KIND_ICON = { info: 'ℹ', good: '✓', warn: '!', bad: '✕' };

// ---- fictional repo model for the project map (acme/pitchside)
const MODS = [
  { id: 'mac', label: 'apps/mac-shell', x: 90, y: 70, owner: 'codex', ticket: 'KAN-141', pr: '#201', review: 'approved', group: 'apps' },
  { id: 'mobile', label: 'apps/mobile-shell', x: 90, y: 210, owner: 'grok', ticket: 'KAN-139', pr: '#198', review: 'approved', group: 'apps' },
  { id: 'fit', label: 'research/fit-geometry', x: 90, y: 350, owner: 'muse', ticket: 'KAN-145', pr: '#209', review: 'changes', group: 'research' },
  { id: 'odds', label: 'ui/odds-screen', x: 380, y: 70, owner: 'cursor', ticket: 'KAN-142', pr: '#212', review: 'in-review', group: 'ui', note: 'dark-mode toggle' },
  { id: 'theme', label: 'ui/theme-tokens', x: 380, y: 210, owner: 'cursor', ticket: 'KAN-143', pr: '#204', review: 'approved', group: 'ui' },
  { id: 'comp', label: 'ui/components', x: 380, y: 350, owner: 'musecode', ticket: 'KAN-144', review: 'none', group: 'ui' },
  { id: 'engine', label: 'core/odds-engine', x: 670, y: 70, owner: 'codex', ticket: 'KAN-146', pr: '#203', review: 'approved', group: 'core' },
  { id: 'feed', label: 'core/feed-adapter', x: 670, y: 210, owner: 'chatgpt', ticket: 'KAN-147', review: 'none', group: 'core', note: 'mocked' },
  { id: 'ai', label: 'core/ai-wiring', x: 670, y: 350, owner: 'codex', ticket: 'KAN-148', pr: '#215', review: 'in-review', group: 'core' },
  { id: 'ci', label: 'scripts/ci-local.sh', x: 380, y: 490, owner: 'ops', ticket: 'KAN-150', review: 'approved', group: 'infra' },
  { id: 'docs', label: 'docs/handoffs', x: 90, y: 490, owner: 'lead', ticket: 'KAN-149', review: 'none', group: 'infra' },
];
const EDGES = [['mac', 'odds'], ['mobile', 'odds'], ['odds', 'theme'], ['odds', 'comp'], ['odds', 'engine'], ['engine', 'feed'], ['ai', 'engine'], ['fit', 'comp'], ['ci', 'comp'], ['ci', 'ai'], ['docs', 'ci']];
const GROUP_COL = { apps: '#bcd6f2', ui: '#cdbcf0', core: '#bfe3c6', research: '#f3c6d3', infra: '#f1e2b6' };
const REVIEW = { approved: ['#3fae5a', 'Approved'], 'in-review': ['#f2b632', 'In review'], changes: ['#e25a4f', 'Changes requested'], none: ['#a49d90', 'No PR yet'] };
const NW = 190, NH = 78;

export function createOverlays(ctx, store) {
  const { bus, clock } = ctx;

  // ------------------------------------------------------------------ toasts
  const stack = $('toast');
  let lastCi = 0;
  function toast(text, opts = {}) {
    if (!text || clock.seeking) return;
    const { kind = 'info', agent, action, ms = 4600 } = opts;
    if ([...stack.children].some((t) => t.dataset.text === text)) return;
    const a = agent && store.agent(agent);
    const el = h('div.toast.k-' + kind, { dataset: { text }, role: 'status' },
      a ? h('span', { html: avatarHTML(a, 24) }) : h('i.ti', KIND_ICON[kind] || 'ℹ'),
      h('span.tx', text));
    if (action) el.append(h('button.btn.small', { onclick: () => { action.onClick?.(); close(); } }, action.label));
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', (e) => { if (!e.target.closest('button')) close(); });
    stack.append(el);
    while (stack.children.length > 4) stack.firstChild.remove();
    setTimeout(close, ms);
  }
  bus.on('toast', (e) => {
    if (/\bCI\b/.test(e.text || '') && Date.now() - lastCi < 3000) return;
    toast(e.text, { kind: e.kind, agent: e.agent });
  });
  bus.on('ask:open', (a) => {
    const ag = store.agent(a.agent);
    toast(`${ag?.short || 'Someone'} needs your call: ${truncate(a.text, 70)}`, { kind: 'warn', agent: a.agent });
  });
  bus.on('ask:answer', ({ choice, agent }) => {
    const skip = /skip/i.test(choice);
    toast(skip ? `Skipped — ${store.agent(agent)?.short || 'the team'} moves on.` : `${/^approve/i.test(choice) ? 'Approved' : choice} — ${store.agent(agent)?.short || 'the team'} is on it.`, { kind: skip ? 'info' : 'good' });
  });
  const ciSeen = {};
  bus.on('surface:update', (e) => {
    if (e.kind === 'ciwall') {
      const st = e.state?.status; if (!st || ciSeen[e.id] === st) return;
      ciSeen[e.id] = st;
      const jobs = e.state.jobs || [], pass = jobs.filter((j) => j.status === 'pass').length;
      if (st === 'pass') { lastCi = Date.now(); toast(`CI green ✓ — ${pass || jobs.length}/${jobs.length || pass} jobs passing`, { kind: 'good', agent: 'ops' }); }
      else if (st === 'fail') { lastCi = Date.now(); const bad = jobs.find((j) => j.status === 'fail'); toast(`CI red — ${bad?.name || 'a job'} failed${bad?.note ? ' (' + truncate(bad.note, 40) + ')' : ''}`, { kind: 'bad', agent: 'ops' }); }
    } else if (e.id === 'jira-2f' && mapOpen) renderMap();
  });
  bus.on('vote:locked', (v) => toast(`${v.proposal} locked: ${truncate(v.text || '', 60)}`, { kind: 'good' }));
  bus.on('replay:reset', () => { for (const k in ciSeen) delete ciSeen[k]; });

  // ------------------------------------------------------------------ binder modal
  const bm = $('binder-modal');
  let binderId = null;
  function binderData(id) {
    let b = null;
    try { b = ctx.director?.getBinder?.(id) || null; } catch { /* stub */ }
    const a = store.agent(id);
    const hist = store.state.hist[id] || [];
    const jira = (ctx.world?.surfaces?.get?.('jira-2f')?.cards || []).filter((c) => [id, a?.short, a?.name].some((n) => n && String(c.owner || '').toLowerCase() === String(n).toLowerCase()));
    const sections = [...(b?.sections || [])];
    if (!b) {
      sections.push({ title: 'Active tasks', items: jira.length ? jira.map((c) => `${c.key} ${c.title} — ${c.col}`) : [store.activityText(id)] });
      const ho = hist.filter((x) => x.kind === 'handoff');
      if (ho.length) sections.push({ title: 'Handoffs', items: ho.slice(0, 3).map((x) => x.text) });
    }
    return {
      summary: b?.summary || `${a?.name} · ${a?.role}. Right now: ${store.activityText(id).toLowerCase()}.`,
      sections, live: hist.slice(0, 7),
    };
  }
  function renderBinder() {
    if (!binderId) return;
    const a = store.agent(binderId); if (!a) return;
    const d = binderData(binderId);
    const html = `<div class="binder" role="dialog" aria-modal="true" aria-label="${esc(a.name)} notebook" style="--c:${a.color}">
      <div class="rings"><i></i><i></i><i></i><i></i></div>
      <div class="pages">
        <header>${avatarHTML(a, 40, STATES[a.status]?.color)}<div><h2 class="serif">${esc(a.short)}’s binder</h2><div class="muted">${esc(a.role)} · ${esc(store.floorName(a.floor))}</div></div><button class="x" data-b="close" aria-label="Close binder">✕</button></header>
        <p class="bsum serif">${esc(d.summary)}</p>
        <div class="bcols"><div>${d.sections.map((s) => `<h4>${esc(s.title)}</h4><ul>${(s.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div>
        <div class="live-notes"><h4><span class="livedot"></span>Live notes</h4>${d.live.length ? d.live.map((x) => `<div class="ln"><time>${denverHM(x.ts)}</time> ${esc(truncate(x.text, 90))}</div>`).join('') : '<div class="muted">Nothing new yet — notes appear here as the session unfolds.</div>'}</div></div>
      </div></div>`;
    if (bm._html !== html) { bm._html = html; bm.innerHTML = html; }
  }
  function openBinder(id) { if (!store.agent(id)) return; binderId = id; bm._html = ''; bm.hidden = false; renderBinder(); }
  function closeBinder() { binderId = null; bm.hidden = true; }
  bm.addEventListener('click', (e) => { if (e.target === bm || e.target.closest('[data-b=close]')) closeBinder(); });
  store.subscribe(() => { if (binderId) renderBinder(); });

  // ------------------------------------------------------------------ project map
  const pm = $('project-map');
  let mapOpen = false;
  const HOME = { x: 40, y: 30, w: 880, h: 580 };
  const vb = { ...HOME };
  const jiraCards = () => ctx.world?.surfaces?.get?.('jira-2f')?.cards || [];
  function liveMods() {
    const cards = jiraCards();
    return MODS.map((m) => {
      const c = cards.find((k) => k.key === m.ticket);
      let review = m.review;
      if (c) review = c.col === 'done' ? 'approved' : c.col === 'review' ? 'in-review' : review === 'approved' ? 'in-review' : review;
      return { ...m, review, col: c?.col };
    });
  }
  function mapSVG() {
    const mods = liveMods(), by = Object.fromEntries(mods.map((m) => [m.id, m]));
    const edges = EDGES.map(([a, b]) => {
      const A = by[a], B = by[b];
      const x1 = A.x + NW / 2, y1 = A.y + NH / 2, x2 = B.x + NW / 2, y2 = B.y + NH / 2;
      const mx = (x1 + x2) / 2;
      return `<path class="edge" d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"/>`;
    }).join('');
    const nodes = mods.map((m) => {
      const o = store.agent(m.owner) || { color: '#a49d90', short: m.owner };
      const [rc, rl] = REVIEW[m.review];
      return `<g class="node" transform="translate(${m.x} ${m.y})"><title>${esc(m.label)} — ${esc(o.short)} · ${esc(m.ticket)} · ${esc(rl)}</title>
        <rect width="${NW}" height="${NH}" rx="12" fill="#fffbf2" stroke="#2b2622" stroke-width="1.6"/>
        <rect width="${NW}" height="22" rx="12" fill="${GROUP_COL[m.group]}" stroke="#2b2622" stroke-width="1.6"/><rect y="12" width="${NW}" height="10" fill="${GROUP_COL[m.group]}"/><line x1="0" y1="22" x2="${NW}" y2="22" stroke="#2b2622" stroke-width="1.2"/>
        <text x="10" y="16" class="mt">${esc(m.label)}</text>
        <circle cx="22" cy="50" r="12" fill="${o.color}" stroke="#2b2622" stroke-width="1.4"/><text x="22" y="54" class="oi" text-anchor="middle" fill="#fff">${esc((o.short || '?').slice(0, 2).toUpperCase())}</text>
        <text x="42" y="46" class="mo">${esc(o.short)}</text><text x="42" y="60" class="mk">${esc(m.ticket)}${m.pr ? ' · PR ' + esc(m.pr) : ''}</text>
        <circle cx="${NW - 16}" cy="50" r="6" fill="${rc}" stroke="#2b2622" stroke-width="1.2"/>${m.review === 'in-review' ? `<circle class="pulse" cx="${NW - 16}" cy="50" r="6" fill="none" stroke="${rc}" stroke-width="2"/>` : ''}
        ${m.note ? `<text x="10" y="${NH - 6}" class="mn">${esc(m.note)}</text>` : ''}</g>`;
    }).join('');
    const groups = Object.entries(GROUP_COL).map(([g, c]) => `<span class="lg"><i style="background:${c}"></i>${g}</span>`).join('');
    return { svg: `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Repository map"><defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#d9ccb3"/></pattern></defs><rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#dots)"/>${edges}${nodes}</svg>`, groups, mods };
  }
  function renderMap() {
    if (!mapOpen) return;
    const keepVB = pm.querySelector('svg')?.getAttribute('viewBox');
    const { svg, groups, mods } = mapSVG();
    const cards = jiraCards();
    const counts = Object.fromEntries(Object.keys(REVIEW).map((k) => [k, mods.filter((m) => m.review === k).length]));
    pm.innerHTML = `<div class="pmap card" role="dialog" aria-modal="true" aria-label="Project map">
      <header><div><h2 class="serif">Project map <small>acme/pitchside</small></h2><div class="muted">Fictional modules, owners and review status · drag to pan · scroll to zoom · Esc to close</div></div>
        <div class="pm-tools"><button class="btn small" data-m="zi">+</button><button class="btn small" data-m="zo">−</button><button class="btn small" data-m="reset">Reset</button><button class="x" data-m="close" aria-label="Close map">✕</button></div></header>
      <div class="pm-body"><div class="pm-canvas">${svg}</div>
        <aside class="pm-side"><h4>Review status</h4>${Object.entries(REVIEW).map(([k, [c, l]]) => `<div class="rv"><i style="background:${c}"></i>${l}<b>${counts[k]}</b></div>`).join('')}
          <h4>Areas</h4><div class="lgs">${groups}</div>
          <h4>Tickets${cards.length ? ' · live' : ''}</h4><div class="tk">${(cards.length ? cards.map((c) => ({ key: c.key, t: c.title, col: c.col, o: c.owner })) : mods.filter((m) => m.ticket).map((m) => ({ key: m.ticket, t: m.label, col: m.review === 'approved' ? 'done' : m.review === 'in-review' ? 'review' : m.review === 'changes' ? 'doing' : 'todo', o: store.agent(m.owner)?.short }))).slice(0, 12).map((c) => `<div class="tkr"><b>${esc(c.key)}</b><span>${esc(truncate(c.t, 28))}</span><em class="col-${esc(c.col)}">${esc(c.col)}</em></div>`).join('')}</div></aside></div></div>`;
    const el = pm.querySelector('svg'); if (keepVB && el) el.setAttribute('viewBox', keepVB);
    bindMap();
  }
  function bindMap() {
    const svg = pm.querySelector('svg'), box = pm.querySelector('.pm-canvas');
    const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const zoom = (f, cx = 0.5, cy = 0.5) => {
      const nw = Math.min(3000, Math.max(250, vb.w * f)), k = nw / vb.w;
      vb.x += (vb.w - nw) * cx; vb.y += (vb.h - vb.h * k) * cy; vb.w = nw; vb.h *= k; setVB();
    };
    box.addEventListener('wheel', (e) => { e.preventDefault(); const r = box.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.12 : 0.89, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
    let drag = null;
    box.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; box.setPointerCapture(e.pointerId); box.classList.add('grab'); });
    box.addEventListener('pointermove', (e) => {
      if (!drag) return; const r = box.getBoundingClientRect();
      vb.x -= (e.clientX - drag.x) * (vb.w / r.width); vb.y -= (e.clientY - drag.y) * (vb.h / r.height); drag = { x: e.clientX, y: e.clientY }; setVB();
    });
    box.addEventListener('pointerup', () => { drag = null; box.classList.remove('grab'); });
    pm.querySelector('.pmap').addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'close') closeProjectMap();
      else if (b.dataset.m === 'zi') zoom(0.8); else if (b.dataset.m === 'zo') zoom(1.25);
      else if (b.dataset.m === 'reset') { Object.assign(vb, HOME); setVB(); }
    });
  }
  function openProjectMap() { if (mapOpen) return; mapOpen = true; Object.assign(vb, HOME); pm.hidden = false; renderMap(); }
  function closeProjectMap() { mapOpen = false; pm.hidden = true; pm.innerHTML = ''; }
  pm.addEventListener('click', (e) => { if (e.target === pm) closeProjectMap(); });
  // double-click on the 4F whiteboard or the Repo X-Ray opens the map
  let lastClick = { id: '', t: 0 };
  bus.on('surface:click', ({ id }) => {
    const now = performance.now();
    if ((id === 'board-4f' || id === 'xray-2f') && lastClick.id === id && now - lastClick.t < 500) { openProjectMap(); lastClick = { id: '', t: 0 }; }
    else lastClick = { id, t: now };
  });
  bus.on('projectmap:open', openProjectMap);

  // ------------------------------------------------------------------ end-of-demo summary
  const sc = $('summary-card');
  let summaryOn = false;
  function showSummary() {
    if (clock.seeking) return;
    const live = summaryOn && !sc.hidden;
    summaryOn = true;
    const scn = ctx.replay?.scenario || ctx.director?.scenario;
    const findings = ['screen-3f-a', 'screen-3f-b'].reduce((n, id) => n + (ctx.world?.surfaces?.get?.(id)?.findings?.length || 0), 0)
      || Object.values(store.state.hist).flat().filter((x) => /finding|issue|bug/i.test(x.text || '')).length;
    const agents = scn?.agents?.length || store.agents(true).length;
    const stats = [['Time', mmss(ctx.replay?.duration || 0)], ['Agents', agents], ['Findings caught', findings], ['Human taps', store.state.taps]];
    const statsHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    if (live) { const el = sc.querySelector('.sumstats'); if (el) el.innerHTML = statsHTML; return; }
    sc.innerHTML = `<div class="sumcard card" role="dialog" aria-modal="true" aria-label="Demo summary"><div class="confetti" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <h2 class="serif">${esc(scn?.title || 'Scenario')} — wrapped</h2><p class="muted">${esc(scn?.summary || 'The replay reached its end.')}</p>
      <div class="sumstats">${statsHTML}</div>
      <div class="btns"><button class="btn primary" data-sm="again">↺ Watch again</button><button class="btn" data-sm="free">Free play</button><button class="btn ghost" data-sm="close">Close</button></div></div>`;
    sc.hidden = false;
  }
  function hideSummary() { summaryOn = false; sc.hidden = true; sc.innerHTML = ''; }
  store.subscribe(() => { if (summaryOn) showSummary(); });
  sc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sm]');
    if (e.target === sc || b?.dataset.sm === 'close') return hideSummary();
    if (b?.dataset.sm === 'again') { hideSummary(); ctx.replay?.seek?.(0); ctx.replay?.play?.(); }
    if (b?.dataset.sm === 'free') { hideSummary(); ctx.director?.reset?.(); ctx.director?.setAmbient?.(true); clock.play(); bus.emit('ui:scenario', { title: '' }); }
  });
  ['replay:load', 'replay:reset', 'replay:seek'].forEach((e) => bus.on(e, hideSummary));

  // close the topmost overlay; returns true if something was closed
  function escape() {
    if (!sc.hidden) { hideSummary(); return true; }
    if (!bm.hidden) { closeBinder(); return true; }
    if (mapOpen) { closeProjectMap(); return true; }
    return false;
  }

  return { toast, openBinder, closeBinder, openProjectMap, closeProjectMap, showSummary, hideSummary, escape };
}
