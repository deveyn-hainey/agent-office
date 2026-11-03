// Shared runtime helpers for the director: sim-time timers with cancel tokens, safe agent/world wrappers,
// activity + Slack emitters. Everything here is local; nothing touches a network.

export function createRuntime(ctx) {
  const { bus, clock } = ctx;
  const timers = new Set();
  const team = new Map(ctx.data.team.agents.map((a) => [a.id, a]));
  const rt = {
    A: () => ctx.agents,
    W: () => ctx.world,
    team,
    tsBase: null, // when set (seeking) -> () => ms
    cursor: () => 0,
  };

  rt.nameOf = (id) => (id === 'you' ? 'You' : team.get(id)?.short || team.get(id)?.name || id);
  rt.fullName = (id) => (id === 'you' ? 'You' : team.get(id)?.name || id);
  rt.ts = () => (rt.tsBase ? rt.tsBase() : clock.simDate().getTime());
  rt.view = (id) => ctx.agents?.get?.(id) || null;
  rt.visible = (id) => !!rt.view(id)?.visible;

  // ---- tokens + sim-time timers (frozen while paused; cancelled tokens resolve false) ----
  rt.token = () => {
    const tk = {
      cancelled: false,
      set: new Set(),
      cancel() {
        tk.cancelled = true;
        for (const t of [...tk.set]) { timers.delete(t); t.res(false); }
        tk.set.clear();
      },
    };
    return tk;
  };
  rt.timer = (sec, tk) => {
    let res;
    const promise = new Promise((r) => { res = r; });
    const t = { left: sec, res, tk };
    if (tk?.cancelled) { res(false); return { promise, cancel() {} }; }
    timers.add(t);
    tk?.set.add(t);
    return { promise, cancel() { timers.delete(t); tk?.set.delete(t); res(false); } };
  };
  rt.sleep = (sec, tk) => rt.timer(sec, tk).promise;
  rt.tick = (dt) => {
    for (const t of [...timers]) {
      t.left -= dt;
      if (t.left <= 0) { timers.delete(t); t.tk?.set.delete(t); t.res(!t.tk?.cancelled); }
    }
  };
  rt.rand = (a, b) => a + Math.random() * (b - a);
  rt.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---- emitters ----
  rt.activity = (agent, text, kind = 'log') => {
    const f = agent && agent !== 'you' ? rt.view(agent)?.floor : null;
    bus.emit('activity', { ts: rt.ts(), agent: agent || 'lead', text, kind, floor: f ?? null });
  };
  rt.slack = (who, text, o = {}) => {
    bus.emit('slack:message', { channel: o.channel || '#pitchside', who, text, ts: rt.ts(), ...(o.you ? { you: true } : {}) });
  };
  rt.toast = (text, kind = 'info', agent) => bus.emit('toast', { text, kind, ...(agent ? { agent } : {}) });

  // ---- agent wrappers (each tolerant of a missing/partial agents module) ----
  rt.say = (id, text, o = {}) => {
    ctx.agents?.say?.(id, text, { ms: o.ms ?? 3500, style: o.style || 'speech' });
    if (text && o.log !== false && (o.style || 'speech') === 'speech') rt.activity(id, text, 'say');
    if (o.slack) rt.slack(rt.fullName(id), text, typeof o.slack === 'object' ? o.slack : {});
  };
  rt.status = (id, state, task = '', o = {}) => {
    ctx.agents?.setStatus?.(id, state, task);
    if (o.log !== false) rt.activity(id, `${state}${task ? ': ' + task : ''}`, 'status');
  };
  rt.pose = (id, pose, ms) => ctx.agents?.setPose?.(id, pose, ms ? { ms } : undefined);
  rt.look = (id, at) => ctx.agents?.lookAt?.(id, at);
  rt.surfaces = (id, op, data) => {
    try { return ctx.world?.surfaces?.update(id, op, data); } catch (e) { console.warn('[director] surface', id, op, e); return null; }
  };
  rt.surfaceState = (id) => { try { return ctx.world?.surfaces?.get(id) || {}; } catch { return {}; } };
  rt.slot = (spec) => ctx.world?.slot?.(String(spec || '').replace(/^slot:/, '')) || null;
  rt.fx = (kind, at) => {
    const s = typeof at === 'string' ? rt.slot(at) : null;
    try { ctx.world?.fx?.(kind, s?.floor ?? at?.floor ?? 0, s?.x ?? at?.x ?? 0, s?.z ?? at?.z ?? 0); } catch { /* optional */ }
  };
  rt.home = (id) => `slot:${team.get(id)?.home || 'wander-1f-1'}`;
  // resolve friendly targets: "home", "desk", "slot:x", "free:x"
  rt.target = (id, to) => (to === 'home' || to === 'desk' ? rt.home(id) : to);

  // walk; resolves true on arrival, false when cancelled / unreachable / timed out
  rt.go = async (id, spec, tk, opts = {}) => {
    if (tk?.cancelled) return false;
    const a = ctx.agents;
    if (!a?.moveTo) return false;
    const tm = rt.timer(opts.timeout ?? 90, tk);
    let ok = false;
    try {
      const p = Promise.resolve(a.moveTo(id, rt.target(id, spec), opts));
      ok = await Promise.race([p.then((v) => v !== false), tm.promise.then(() => false)]);
    } catch (e) { console.warn('[director] move failed', id, spec, e); }
    tm.cancel();
    return ok && !tk?.cancelled;
  };

  // directed camera: only when "Auto camera follow" is on and the human has not touched the camera recently
  rt.camera = (view, o = {}) => {
    const cam = ctx.cam;
    if (!cam || cam.userActive?.(20) || ctx.ui?.routines?.camera === false) return false;
    cam.setView(view, { animate: !clock.seeking, duration: o.duration ?? 1.3 });
    return true;
  };
  // floor index a slot spec ('slot:x' | 'free:prefix' | 'x') lives on
  rt.floorOf = (spec) => {
    const id = String(spec || '').replace(/^slot:|^free:/, '');
    return ctx.world?.slot?.(id)?.floor ?? ctx.world?.slots?.(id)?.[0]?.floor ?? null;
  };

  // short human label for a slot id (used in activity lines)
  rt.placeLabel = (spec) => {
    const s = String(spec || '').replace(/^slot:|^free:/, '');
    const table = [
      [/^huddle-4f/, 'the huddle circle (4F)'], [/^whiteboard-4f/, 'the 4F whiteboard'], [/^vote-4f/, 'the #decisions board'],
      [/^desk-4f-lead/, 'the lead desk (4F)'], [/^desk-4f/, 'a 4F desk'], [/^conf-3f-a|^present-3f-a|^door-3f-a/, 'Conference Room A'],
      [/^conf-3f-b|^present-3f-b|^door-3f-b/, 'Conference Room B'], [/^desk-3f/, 'the reviewer desk (3F)'], [/^corkboard-3f/, 'the evidence corkboard'],
      [/^present-2f|^whiteboard-2f|^audience-2f/, 'the 2F team whiteboard'], [/^jira-2f/, 'the Jira board'], [/^ci-2f/, 'the CI wall'],
      [/^xray-2f/, 'the Repo X-Ray'], [/^desk-2f/, 'a 2F desk pod'], [/^mural-1f/, 'the lobby mural wall'], [/^coffee-1f/, 'the coffee bar'],
      [/^cooler-1f/, 'the water cooler'], [/^sofa-1f/, 'the lobby sofa'], [/^hot-1f/, 'a hot desk'], [/^entrance-1f|^wander-1f/, 'the lobby'],
      [/^desk-1f/, 'reception'], [/^sofa-(\d)f/, 'a lounge sofa'], [/^wander-(\d)f/, 'the floor'],
    ];
    for (const [re, label] of table) if (re.test(s)) return label;
    return s;
  };

  return rt;
}
