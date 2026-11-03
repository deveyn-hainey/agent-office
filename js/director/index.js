// Director + replay (S3). Executes scenario JSON on the shared clock, runs ambient office life for unclaimed agents,
// and routes the command box. Contract: docs/ARCHITECTURE.md §7. Additions are documented in docs/notes/s3.md.
import { createRuntime } from './runtime.js';
import { createActions } from './actions.js';
import { createAmbient } from './ambient.js';
import { createCommands } from './commands.js';
import { createHandlers } from './events.js';
import { hideSummary } from './summary.js';

export function createDirector(ctx) {
  const { bus, clock } = ctx;
  const rt = createRuntime(ctx);
  const get = (path) => fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });

  let index = null, scenario = null, events = [], cursor = 0, next = 0, blocked = null, running = false, lastEmit = 0, ended = false;
  let totalBlocked = 0, startMs = Date.now();
  const claimed = new Set();
  const asks = new Map();
  let pristineBinders = {};
  let binders = {};
  let sceneToken = rt.token();
  const stats = { agents: new Set(), findings: 0, asks: 0 };
  rt.cursor = () => cursor;

  fetch('data/binders.json').then((r) => (r.ok ? r.json() : {})).then((j) => { pristineBinders = j || {}; binders = clone(pristineBinders); bus.emit('binder:update', { agent: null }); }).catch(() => {});
  const clone = (o) => JSON.parse(JSON.stringify(o ?? {}));

  const isClaimed = (id) => claimed.has(id) || [...asks.values()].some((a) => a.agent === id);
  const actionsHooks = {
    claim: (id) => d.claim(id),
    release: (ids) => ids.forEach((i) => claimed.delete(i)),
    getBinder: (id) => director.getBinder(id),
    pendingAsks: () => director.pendingAsks(),
    answer: (id, c) => director.answer(id, c),
    finding: () => { stats.findings++; },
  };
  const actions = createActions(ctx, rt, actionsHooks);
  const ambient = createAmbient(ctx, rt, actions, isClaimed);

  const d = {
    stats, asks, get binders() { return binders; },
    get sceneToken() { return sceneToken; },
    claim(id) { if (!id) return; claimed.add(id); ambient.claim(id); },
    release: (id) => claimed.delete(id),
    setBlocked: (b) => { blocked = b; },
    setAmbient: (on) => director.setAmbient(on),
    answer: (id, c, o) => director.answer(id, c, o),
    elapsed: () => cursor + totalBlocked,
  };
  const handlers = createHandlers(ctx, rt, actions, d);
  const commands = createCommands(ctx, rt, actions, actionsHooks);

  function dispatch(e) {
    const h = handlers[e.type];
    if (!h) return console.warn('[director] unknown event type', e.type);
    try { h(e); } catch (err) { console.error('[director] event failed', e, err); }
    bus.emit('scenario:event', { t: e.t, event: e });
  }

  function step(dt) {
    if (blocked) {
      blocked.left -= dt;
      totalBlocked += dt;
      let done;
      if (blocked.type === 'arrive') done = blocked.agents.every((id) => !rt.visible(id) || ctx.agents.isArrived(id));
      else done = !asks.has(blocked.id);
      if (!done && blocked.left <= 0) {
        if (blocked.type === 'answer' && blocked.auto && asks.has(blocked.id)) director.answer(blocked.id, asks.get(blocked.id).options?.[0] || 'Approve', { auto: true });
        done = true;
      }
      if (!done) return;
      blocked = null;
    }
    cursor += dt;
    while (next < events.length && events[next].t <= cursor) {
      dispatch(events[next++]);
      if (blocked) return;
    }
    if (next >= events.length && !blocked && running && !clock.seeking && !ended) finish();
  }

  function finish() {
    ended = true;
    running = false;
    bus.emit('replay:time', { t: director.duration, duration: director.duration });
    bus.emit('replay:end', { id: scenario?.id });
    // hand everyone back to ambient life shortly after the finale
    rt.sleep(6, sceneToken).then((ok) => { if (ok) scenario?.agents?.forEach((id) => claimed.delete(id)); });
  }

  const director = {
    async load(idOrAlias) {
      try {
        index ||= await get('data/scenarios/index.json');
      } catch (e) { console.warn('[director] no scenario index', e); return null; }
      const id = index.aliases?.[idOrAlias] || idOrAlias;
      const entry = index.scenarios.find((s) => s.id === id);
      if (!entry) { console.warn(`[director] scenario "${idOrAlias}" not available`); return null; }
      let sc;
      try { sc = await get(`data/scenarios/${entry.file}`); } catch (e) { console.warn('[director] scenario load failed', e); return null; }
      scenario = sc;
      events = sc.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map((x) => x.e);
      running = false;
      director.reset();
      bus.emit('replay:load', { id: scenario.id, title: scenario.title, duration: director.duration, chapters: scenario.chapters || [], agents: scenario.agents || [] });
      return scenario;
    },

    reset() {
      sceneToken.cancel();
      sceneToken = rt.token();
      commands.cancelAll();
      ambient.reset();
      cursor = 0; next = 0; blocked = null; ended = false; totalBlocked = 0;
      asks.clear();
      claimed.clear();
      scenario?.agents?.forEach((id) => claimed.add(id));
      stats.agents.clear(); stats.findings = 0; stats.asks = 0;
      binders = clone(pristineBinders);
      hideSummary();
      ctx.agents?.reset?.(); ctx.world?.reset?.();
      startMs = clock.simDate().getTime();
      bus.emit('replay:reset', {});
      bus.emit('binder:update', { agent: null });
    },

    play() {
      if (scenario) {
        if (ended || (next >= events.length && !blocked && events.length)) { director.reset(); }
        running = true;
        bus.emit('replay:play', {});
      }
      clock.play();
    },
    pause() { clock.pause(); bus.emit('replay:pause', {}); },
    restart() { director.seek(0); director.play(); },

    seek(t) {
      t = Math.max(0, +t || 0);
      bus.emit('replay:seek', { t });
      const was = running;
      director.reset();
      clock.seeking = true;
      rt.tsBase = () => startMs + cursor * 1000;
      try {
        let guard = 0;
        while (cursor < t && next < events.length && guard++ < 200000) step(0.1);
        // drain events that fall exactly at/below t
      } finally {
        clock.seeking = false;
        rt.tsBase = null;
      }
      cursor = Math.min(Math.max(cursor, 0), Math.max(t, 0));
      running = was || running;
      bus.emit('replay:time', { t: cursor, duration: director.duration });
      bus.emit('replay:seeked', { t: cursor });
    },

    get time() { return cursor; },
    get duration() { return scenario ? Math.max(0, ...events.map((e) => e.t)) + 3 : 0; },
    get running() { return running; },
    get scenario() { return scenario; },
    setAmbient: (on) => ambient.set(on),
    get ambient() { return ambient.enabled; },
    claim: (ids) => [].concat(ids).forEach((i) => d.claim(i)),
    release: (ids) => [].concat(ids).forEach((i) => claimed.delete(i)),
    isClaimed,
    pendingAsks: () => [...asks.values()].map((a) => ({ id: a.id, agent: a.agent, text: a.text, options: a.options || ['Approve', 'Skip'] })),

    answer(id, choice, o = {}) {
      const a = asks.get(id);
      if (!a) return;
      asks.delete(id);
      ctx.agents?.setAlert?.(a.agent, false);
      rt.status(a.agent, 'working', a.next || '', { log: false });
      bus.emit('ask:answer', { id, choice, agent: a.agent, ...(o.auto ? { auto: true } : {}) });
      rt.activity('you', `${choice}${o.auto ? ' (auto, demo)' : ''}: ${a.text}`, 'ask');
      rt.slack('You', `${choice}${o.auto ? ' (auto-approved for the demo)' : ''}`, { you: true });
      const reply = a.reply?.[choice];
      if (reply) setTimeout(() => rt.say(a.agent, reply, { ms: 4600, slack: true }), clock.seeking ? 0 : 600 / Math.max(0.5, clock.speed));
      if (!claimed.has(a.agent) && !isClaimed(a.agent)) ctx.agents?.setStatus?.(a.agent, 'working', a.next || '');
    },

    getBinder: (id) => (binders[id] ? clone(binders[id]) : null),
    command: (text, o) => commands.command(text, o),
    parseCommand: (text) => commands.parse(text),

    update(dt, simT) {
      if (dt > 0) { rt.tick(dt); ambient.update(dt); }
      if (!running || clock.paused || dt <= 0) return;
      let left = dt;
      while (left > 1e-6 && running) { const s = Math.min(0.25, left); left -= s; step(s); }
      if (simT - lastEmit > 0.25) { lastEmit = simT; bus.emit('replay:time', { t: Math.min(cursor, director.duration), duration: director.duration }); }
    },
  };
  ctx.scene.addUpdate((dt, t) => director.update(dt, t));
  return director;
}

export function createReplay(ctx) {
  const d = () => ctx.director;
  let idx = null;
  return {
    load: (id) => d().load(id),
    play: () => d().play(),
    pause: () => d().pause(),
    toggle: () => (ctx.clock.paused || !d().running ? d().play() : d().pause()),
    seek: (t) => d().seek(t),
    restart: () => d().restart(),
    setSpeed: (s) => ctx.clock.setSpeed(Math.max(0.5, Math.min(8, +s || 1))),
    get time() { return d().time; },
    get duration() { return d().duration; },
    get playing() { return d().running && !ctx.clock.paused; },
    get scenario() { return d().scenario; },
    list: async () => (idx ||= (await fetch('data/scenarios/index.json').then((r) => r.json())).scenarios),
  };
}
