// Scenario event handlers. Each handler gets the event and drives World / Agents / UI through their public APIs.
// Core types follow docs/ARCHITECTURE.md §7.3; extras (board, jira, ci, finding, screen, xray, binder, handoff, coffee, nap,
// draw, present, cheer, summary, standup) are documented in docs/notes/s3.md.
import { showSummary } from './summary.js';

export function createHandlers(ctx, rt, actions, d) {
  const { bus, clock } = ctx;
  const A = () => ctx.agents;
  const W = () => ctx.world;
  const ids = (e) => (e.agents === 'all' ? (A()?.list?.() || []).map((a) => a.id) : e.agents || (e.agent ? [e.agent] : []));
  const touch = (...list) => list.flat().filter(Boolean).forEach((id) => d.stats.agents.add(id));
  const sev = (s) => String(s || 'med').toUpperCase();
  const routine = (fn) => { Promise.resolve(fn(d.sceneToken)).catch((err) => console.warn('[director] routine', err)); };

  const h = {
    status(e) {
      touch(e.agent);
      rt.status(e.agent, e.state, e.task || '', { log: !e.quiet });
    },

    say(e) {
      touch(e.agent);
      const style = e.style || 'speech';
      rt.say(e.agent, e.text || '', { ms: e.ms ?? 3500, style, log: !e.quiet && e.log !== false, slack: e.slack ? (e.channel ? { channel: e.channel } : true) : false });
      if (style === 'think' && e.log) rt.activity(e.agent, e.log, 'log');
    },

    move(e) {
      touch(e.agent);
      d.claim(e.agent);
      const to = rt.target(e.agent, e.to);
      if (!e.quiet && e.log !== false) rt.activity(e.agent, `heads to ${rt.placeLabel(to)}`, 'move');
      Promise.resolve(A()?.moveTo?.(e.agent, to, { run: !!e.run, via: e.via })).catch((err) => console.warn('[director] move', err));
    },

    waitArrive(e) {
      if (clock.seeking) return;
      d.setBlocked({ type: 'arrive', agents: ids(e), left: e.timeout ?? 60 });
    },
    waitAnswer(e) {
      if (clock.seeking) {
        if (e.auto !== false && d.asks.has(e.id)) d.answer(e.id, d.asks.get(e.id).options?.[0] || 'Approve', { auto: true });
        return;
      }
      d.setBlocked({ type: 'answer', id: e.id, left: e.timeout ?? 120, auto: e.auto !== false });
    },

    look(e) { ids(e).forEach((id) => rt.look(id, e.at)); },
    pose(e) { touch(e.agent); rt.pose(e.agent, e.pose, e.ms); },
    surface(e) { rt.surfaces(e.surface, e.op || 'set', e.data); },

    // whiteboard sugar: { surface?='board-4f', request|step|card|note|title }
    board(e) {
      const s = e.surface || 'board-4f';
      if (e.title) rt.surfaces(s, 'merge', { title: e.title });
      if (e.request) rt.surfaces(s, 'push', { path: 'requests', item: e.request });
      if (e.step) rt.surfaces(s, 'push', { path: 'steps', item: e.step });
      if (e.stepDone != null) rt.surfaces(s, 'update', { path: 'steps', match: { n: e.stepDone }, set: { done: true } });
      if (e.card) rt.surfaces(s, 'push', { path: 'cards', item: e.card });
      if (e.cardUpdate) rt.surfaces(s, 'update', { path: 'cards', match: { id: e.cardUpdate.id }, set: e.cardUpdate.set });
      if (e.note) rt.surfaces(s, 'push', { path: 'notes', item: e.note });
      if (e.clear) rt.surfaces(s, 'clear');
      if (e.log) rt.activity(e.agent || 'lead', e.log, 'log');
    },

    feed(e) {
      const who = e.who || rt.fullName(e.agent);
      if (e.agent) touch(e.agent);
      rt.slack(who, e.text, { channel: e.channel, you: who === 'You' });
    },

    vote(e) {
      touch(e.agent);
      A()?.ballot?.(e.agent, e.choice);
      const st = rt.surfaceState('vote-4f');
      const p = (st.proposals || []).find((x) => x.id === e.proposal);
      bus.emit('vote:cast', { proposal: e.proposal, agent: e.agent, choice: e.choice });
      rt.activity(e.agent, `voted ${String(e.choice).toUpperCase()} on ${e.proposal}`, 'vote');
      if (!p) return;
      const votes = { ...(p.votes || {}), [e.agent]: e.choice };
      const yes = Object.values(votes).filter((v) => v === 'yes').length;
      const no = Object.values(votes).filter((v) => v === 'no').length;
      const locking = !p.locked && (yes >= 2 || no >= 2);
      rt.surfaces('vote-4f', 'update', { path: 'proposals', match: { id: e.proposal }, set: { votes, yes, no, locked: p.locked || locking } });
      if (locking) {
        bus.emit('vote:locked', { proposal: e.proposal, text: p.text });
        rt.activity('lead', `${e.proposal} locked (${yes >= 2 ? 'YES' : 'NO'} ${Math.max(yes, no)}–${Math.min(yes, no)}): ${p.text}`, 'vote');
        rt.fx('sparkle', 'slot:vote-4f-front');
      }
    },

    ask(e) {
      touch(e.agent);
      const options = e.options || ['Approve', 'Skip'];
      d.asks.set(e.id, { ...e, options });
      d.stats.asks++;
      d.claim(e.agent);
      rt.status(e.agent, 'waiting', e.text, { log: false });
      A()?.setAlert?.(e.agent, true);
      bus.emit('ask:open', { id: e.id, agent: e.agent, text: e.text, options });
      rt.activity(e.agent, e.text, 'ask');
      if (e.slack !== false) rt.slack(rt.fullName(e.agent), e.text);
    },

    toast(e) { rt.toast(e.text, e.kind || 'info', e.agent); },
    camera(e) {
      const cam = ctx.cam || ctx.scene?.cam;
      if (!cam || cam.userActive?.(20)) return;
      cam.setView(e.view, { duration: e.duration, animate: !clock.seeking });
    },
    door(e) { Promise.resolve(W()?.setDoor?.(e.door, e.open)).catch(() => {}); },
    spawn(e) {
      touch(e.agent);
      d.claim(e.agent);
      if (!e.quiet) rt.activity(e.agent, `joins the office (${rt.team.get(e.agent)?.role || 'subagent'})`, 'move');
      Promise.resolve(A()?.spawn?.(e.agent, e.at)).catch((err) => console.warn('[director] spawn', err));
    },
    despawn(e) { A()?.despawn?.(e.agent); },
    release(e) { ids(e).forEach((id) => d.release(id)); },
    fx(e) { rt.fx(e.kind, e.at ? e.at : { floor: e.floor ?? 0, x: e.x ?? 0, z: e.z ?? 0 }); },
    log(e) { rt.activity(e.agent || 'lead', e.text, e.kind || 'log'); },
    ambient(e) { d.setAmbient(!!e.on); },
    marker(e) { bus.emit('replay:marker', { id: e.id, label: e.label, t: e.t }); },

    // ---- Jira-style board upsert: { key, title?, col, owner? } ----
    jira(e) {
      const cards = [...(rt.surfaceState('jira-2f').cards || [])];
      const i = cards.findIndex((c) => c.key === e.key);
      const patch = { key: e.key };
      for (const k of ['title', 'col', 'owner']) if (e[k] != null) patch[k] = e[k];
      if (i >= 0) cards[i] = { ...cards[i], ...patch }; else cards.push({ title: e.key, col: 'todo', ...patch });
      rt.surfaces('jira-2f', 'merge', { cards });
      const col = { todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' }[e.col] || e.col;
      if (!e.quiet) rt.activity(e.agent || e.owner || 'lead', `${e.key} → ${col}${e.title ? ` · ${e.title}` : ''}`, 'log');
    },

    // ---- CI wall: { jobs:[names|objs], badge?, job, status, note, overall? } ----
    ci(e) {
      const st = rt.surfaceState('ci-2f');
      let jobs = [...(st.jobs || [])];
      if (e.jobs) jobs = e.jobs.map((j) => (typeof j === 'string' ? { name: j, status: e.status || 'queued' } : j));
      if (e.job) {
        const i = jobs.findIndex((j) => j.name === e.job);
        const next = { name: e.job, status: e.status || 'running', ...(e.note ? { note: e.note } : {}) };
        if (i >= 0) jobs[i] = { ...jobs[i], ...next, ...(e.note ? {} : { note: undefined }) }; else jobs.push(next);
      }
      let status = e.overall;
      if (!status) {
        if (jobs.some((j) => j.status === 'fail')) status = 'fail';
        else if (jobs.some((j) => ['running', 'queued', 'warn'].includes(j.status))) status = 'running';
        else status = jobs.length ? 'pass' : 'idle';
      }
      rt.surfaces('ci-2f', 'set', { ...st, badge: e.badge || st.badge || 'local CI', status, jobs });
      if (e.job) rt.activity(e.agent || 'ops', `${e.job}: ${e.status || 'running'}${e.note ? ` — ${e.note}` : ''}`, 'ci');
      else if (e.text) rt.activity(e.agent || 'ops', e.text, 'ci');
    },

    // ---- conference screens ----
    screen(e) {
      rt.surfaces(e.screen, 'set', { title: e.title, agent: e.agent, findings: e.findings || [] });
    },
    finding(e) {
      touch(e.agent);
      const st = rt.surfaceState(e.screen);
      if (!st.title) rt.surfaces(e.screen, 'merge', { title: e.title || 'Findings', agent: e.agent });
      const item = { sev: e.sev, text: e.text, ...(e.file ? { file: e.file } : {}) };
      rt.surfaces(e.screen, 'push', { path: 'findings', item });
      d.stats.findings++;
      rt.activity(e.agent, `flagged ${sev(e.sev)}: ${e.text}${e.file ? ` (${e.file})` : ''}`, 'log');
      if (e.cork) rt.surfaces('cork-3f', 'push', { path: 'notes', item: { text: e.cork } });
      if (e.link != null) rt.surfaces('cork-3f', 'push', { path: 'strings', item: e.link });
    },

    xray(e) {
      const patch = {};
      for (const k of ['nodes', 'edges', 'highlight']) if (e[k]) patch[k] = e[k];
      rt.surfaces('xray-2f', 'merge', patch);
      if (e.log) rt.activity(e.agent || 'lead', e.log, 'log');
    },

    // ---- binders: { agent, summary?, section, add:[…], set:[…] } ----
    binder(e) {
      const b = d.binders[e.agent] ||= { summary: '', sections: [] };
      if (e.summary != null) b.summary = e.summary;
      if (e.section) {
        let s = b.sections.find((x) => x.title === e.section);
        if (!s) b.sections.push((s = { title: e.section, items: [] }));
        if (e.set) s.items = [...e.set];
        if (e.add) s.items.push(...e.add);
      }
      bus.emit('binder:update', { agent: e.agent });
    },

    // ---- baton pass: { agent, to, file, text } ----
    handoff(e) {
      const to = e.recipient;
      touch(e.agent, to);
      const file = e.file || 'HANDOFF-2026-11-03.md';
      rt.activity(e.agent, `wrote ${file} → ${rt.nameOf(to)}`, 'handoff');
      if (e.text) rt.slack(rt.fullName(e.agent), e.text);
      A()?.lookAt?.(e.agent, `agent:${to}`);
      A()?.lookAt?.(to, `agent:${e.agent}`);
      const sl = rt.slot(rt.view(to)?.slotId);
      if (sl) rt.fx('sparkle', { floor: sl.floor, x: sl.x, z: sl.z });
      h.binder({ agent: e.agent, section: 'Handoffs', add: [`${file} → ${rt.nameOf(to)}`] });
      h.binder({ agent: to, section: 'Handoffs', add: [`${file} ← ${rt.nameOf(e.agent)}`] });
    },

    // ---- routines (non-blocking; snap when seeking) ----
    coffee(e) { touch(e.agent); d.claim(e.agent); routine((tk) => actions.coffee(e.agent, tk, { home: e.home !== false, line: e.line, back: e.back })); },
    nap(e) { touch(e.agent); d.claim(e.agent); routine((tk) => actions.nap(e.agent, tk, { hotDesk: e.hotDesk !== false, ms: e.ms, task: e.task })); },
    draw(e) { touch(e.agent); d.claim(e.agent); routine((tk) => actions.draw(e.agent, e.text, tk)); },
    present(e) { touch(e.agent); d.claim(e.agent); routine((tk) => actions.present(e.agent, e.lines, tk, { slot: e.slot })); },
    cheer(e) { touch(ids(e)); ids(e).forEach((id) => { rt.pose(id, 'cheer', e.ms || 4000); if (e.text) rt.say(id, e.text, { ms: 2200, style: 'cheer', log: false }); }); },

    // ---- end card ----
    summary(e) {
      const data = {
        title: e.title || 'Demo summary',
        elapsed: d.elapsed(),
        agents: d.stats.agents.size,
        findings: d.stats.findings,
        taps: d.stats.asks,
        lines: e.lines || [],
      };
      bus.emit('scenario:summary', data);
      rt.activity('lead', `Summary: ${Math.round(data.elapsed)}s · ${data.agents} agents · ${data.findings} findings · ${data.taps} human taps`, 'log');
      showSummary(ctx, data);
    },
  };
  return h;
}
