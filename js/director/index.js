// STUB director + replay (S3 replaces this folder's contents, keeping the exported contract).
// Executes scenario JSON events on the shared clock. Implements the core event types so the page demos end to end.

export function createDirector(ctx) {
  const { bus, clock } = ctx;
  const get = (path) => fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });

  let index = null, scenario = null, events = [], cursor = 0, next = 0, blocked = null, running = false, lastEmit = 0;
  const claimed = new Set();
  const asks = new Map();
  let ambient = true;

  const A = () => ctx.agents, W = () => ctx.world;
  const slotRef = (s) => String(s || '').replace(/^slot:/, '');
  const activity = (agent, text, kind = 'log') => bus.emit('activity', { ts: clock.simDate().getTime(), agent, text, kind, floor: A()?.get(agent)?.floor ?? null });

  const handlers = {
    status: (e) => { A().setStatus(e.agent, e.state, e.task || ''); activity(e.agent, `${e.state}${e.task ? ': ' + e.task : ''}`, 'status'); },
    say: (e) => { A().say(e.agent, e.text || '', { ms: e.ms, style: e.style }); if (e.text && !e.quiet) activity(e.agent, e.text, 'say'); },
    move: (e) => { claimed.add(e.agent); A().moveTo(e.agent, e.to); },
    look: (e) => (e.agents || [e.agent]).forEach((id) => A().lookAt(id, e.at)),
    pose: (e) => A().setPose(e.agent, e.pose, { ms: e.ms }),
    surface: (e) => W().surfaces.update(e.surface, e.op || 'set', e.data),
    feed: (e) => { bus.emit('slack:message', { channel: e.channel || '#pitchside', who: e.who, text: e.text, ts: clock.simDate().getTime() }); },
    vote: (e) => { A().ballot(e.agent, e.choice); bus.emit('vote:cast', { proposal: e.proposal, agent: e.agent, choice: e.choice }); activity(e.agent, `voted ${e.choice} on ${e.proposal}`, 'vote'); },
    ask: (e) => {
      asks.set(e.id, e);
      A().setStatus(e.agent, 'waiting', e.text); A().setAlert(e.agent, true);
      bus.emit('ask:open', { id: e.id, agent: e.agent, text: e.text, options: e.options || ['Approve', 'Skip'] });
      activity(e.agent, e.text, 'ask');
    },
    toast: (e) => bus.emit('toast', { text: e.text, kind: e.kind || 'info', agent: e.agent }),
    camera: (e) => { if (!ctx.scene.cam.userActive(20)) ctx.scene.cam.setView(e.view, { duration: e.duration }); },
    spawn: (e) => { claimed.add(e.agent); A().spawn(e.agent, e.at); },
    despawn: (e) => A().despawn(e.agent),
    release: (e) => (e.agents || [e.agent]).forEach((id) => claimed.delete(id)),
    fx: (e) => { const s = e.at ? W().slot(slotRef(e.at)) : null; W().fx(e.kind, s?.floor ?? e.floor ?? 0, s?.x ?? e.x ?? 0, s?.z ?? e.z ?? 0); },
    log: (e) => activity(e.agent, e.text, e.kind || 'log'),
    ambient: (e) => { ambient = !!e.on; },
    marker: (e) => bus.emit('replay:marker', { id: e.id, label: e.label, t: e.t }),
    waitArrive: (e) => { if (!clock.seeking) blocked = { type: 'arrive', agents: e.agents === 'all' ? A().list().map((a) => a.id) : e.agents, left: e.timeout ?? 60 }; },
    waitAnswer: (e) => { if (!clock.seeking) blocked = { type: 'answer', id: e.id, left: e.timeout ?? 120 }; },
  };

  function dispatch(e) {
    const h = handlers[e.type];
    if (!h) return console.warn('[director] unknown event type', e.type);
    try { h(e); } catch (err) { console.error('[director] event failed', e, err); }
    bus.emit('scenario:event', { t: e.t, event: e });
  }

  function step(dt) {
    if (blocked) {
      blocked.left -= dt;
      const done = blocked.type === 'arrive' ? blocked.agents.every((id) => A().isArrived(id)) : !asks.has(blocked.id);
      if (done || blocked.left <= 0) blocked = null; else return;
    }
    cursor += dt;
    while (next < events.length && events[next].t <= cursor) {
      dispatch(events[next++]);
      if (blocked) break;
    }
    if (next >= events.length && !blocked && running) { running = false; bus.emit('replay:end', { id: scenario?.id }); }
  }

  const director = {
    async load(idOrAlias) {
      index ||= await get('data/scenarios/index.json');
      const id = index.aliases?.[idOrAlias] || idOrAlias;
      const entry = index.scenarios.find((s) => s.id === id);
      if (!entry) { console.warn(`[director] scenario "${idOrAlias}" not available yet`); return null; }
      scenario = await get(`data/scenarios/${entry.file}`);
      events = [...scenario.events].sort((a, b) => a.t - b.t);
      director.reset();
      bus.emit('replay:load', { id: scenario.id, title: scenario.title, duration: director.duration, chapters: scenario.chapters || [], agents: scenario.agents || [] });
      return scenario;
    },
    reset() {
      cursor = 0; next = 0; blocked = null; asks.clear();
      A()?.reset(); W()?.reset();
      bus.emit('replay:reset', {});
    },
    play() { if (scenario) { running = true; bus.emit('replay:play', {}); } clock.play(); },
    pause() { clock.pause(); bus.emit('replay:pause', {}); },
    seek(t) {
      bus.emit('replay:seek', { t });
      director.reset();
      clock.seeking = true;
      try { while (cursor < t && (next < events.length)) step(0.1); } finally { clock.seeking = false; }
      cursor = Math.min(cursor, t);
      bus.emit('replay:seeked', { t: cursor });
    },
    get time() { return cursor; },
    get duration() { return scenario ? Math.max(0, ...events.map((e) => e.t)) + 3 : 0; },
    get running() { return running; },
    get scenario() { return scenario; },
    setAmbient: (on) => { ambient = !!on; },
    claim: (ids) => ids.forEach((i) => claimed.add(i)),
    release: (ids) => ids.forEach((i) => claimed.delete(i)),
    isClaimed: (id) => claimed.has(id),
    pendingAsks: () => [...asks.values()],
    answer(id, choice) {
      const a = asks.get(id); if (!a) return;
      asks.delete(id);
      A().setAlert(a.agent, false); A().setStatus(a.agent, 'working', '');
      bus.emit('ask:answer', { id, choice, agent: a.agent });
      activity('you', `${choice}: ${a.text}`, 'ask');
    },
    getBinder: () => null,
    async command(text) {
      bus.emit('command:submitted', { text });
      bus.emit('slack:message', { channel: '#pitchside', who: 'You', text, ts: clock.simDate().getTime(), you: true });
      W().surfaces.update('board-4f', 'push', { path: 'requests', item: { who: 'You', text } });
      activity('you', text, 'command');
      const res = { ok: true, summary: 'Stub director: request posted to the board (no actions yet).' };
      bus.emit('command:result', { text, ...res });
      return res;
    },
    update(dt, simT) {
      if (!running || clock.paused || dt <= 0) return;
      step(dt);
      if (simT - lastEmit > 0.25) { lastEmit = simT; bus.emit('replay:time', { t: cursor, duration: director.duration }); }
    },
  };
  ctx.scene.addUpdate((dt, t) => director.update(dt, t));
  return director;
}

export function createReplay(ctx) {
  const d = () => ctx.director;
  return {
    load: (id) => d().load(id),
    play: () => d().play(),
    pause: () => d().pause(),
    toggle: () => (ctx.clock.paused || !d().running ? d().play() : d().pause()),
    seek: (t) => d().seek(t),
    setSpeed: (s) => ctx.clock.setSpeed(s),
    get time() { return d().time; },
    get duration() { return d().duration; },
    get playing() { return d().running && !ctx.clock.paused; },
    get scenario() { return d().scenario; },
    list: async () => (await fetch('data/scenarios/index.json').then((r) => r.json())).scenarios,
  };
}
