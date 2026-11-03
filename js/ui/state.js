// UI-side derived state: per-agent activity text + stats, approvals, finished items, routines.
// Everything here is a pure reaction to bus events / ctx reads, so the UI keeps working when other modules are stubs.
import { hash, STATES } from '../core/util.js';

const FLOOR_NAMES = ['Lobby / Lounge', 'Build / Ops', 'Review', 'Strategy'];

// friendly phrases for the slot an agent just arrived at / is heading to
const SLOT_PHRASE = [
  [/^desk-4f-lead/, 'Back at the lead desk', 'Heading to the lead desk'],
  [/^desk-/, 'Back at desk', 'Walking to a desk'],
  [/^hot-/, 'Settling in at a hot desk', 'Grabbing a free hot desk'],
  [/^huddle-/, 'In the huddle circle', 'Joining the huddle'],
  [/^whiteboard-/, 'Writing on the whiteboard', 'Heading to the whiteboard'],
  [/^vote-/, 'Studying the vote board', 'Heading to the vote board'],
  [/^present-/, 'Presenting findings', 'Heading up to present'],
  [/^audience-/, 'Listening to the readout', 'Taking a seat for the readout'],
  [/^conf-3f-a/, 'Reviewing in Conference Room A', 'Heading to Conference Room A'],
  [/^conf-3f-b/, 'Reviewing in Conference Room B', 'Heading to Conference Room B'],
  [/^door-/, 'Waiting at the glass door', 'Walking to the glass door'],
  [/^coffee-/, 'Grabbing a coffee', 'Heading to the coffee bar'],
  [/^cooler-/, 'Chatting at the water cooler', 'Wandering to the water cooler'],
  [/^sofa-/, 'Napping on the lounge sofa', 'Heading for the sofa'],
  [/^mural-/, 'Sketching on the mural wall', 'Heading to the mural wall'],
  [/^corkboard-/, 'Pinning evidence to the corkboard', 'Heading to the corkboard'],
  [/^xray-/, 'Studying the Repo X-Ray', 'Heading to the Repo X-Ray'],
  [/^jira-/, 'Checking the Jira board', 'Heading to the Jira board'],
  [/^ci-/, 'Watching the CI wall', 'Heading to the CI wall'],
  [/^elevator-/, 'Waiting for the elevator', 'Heading to the elevator'],
  [/^stairs-/, 'On the stairs', 'Heading to the stairs'],
  [/^entrance-/, 'By the front entrance', 'Heading to the entrance'],
  [/^wander-/, 'Stretching their legs', 'Taking a stroll'],
];
const POSE_PHRASE = {
  nap: 'Napping', drink: 'Sipping coffee', draw: 'Drawing on the wall', present: 'Presenting findings',
  cheer: 'Celebrating!', 'sit-type': 'Typing away', think: 'Thinking it over', wave: 'Waving hello',
};
const phrase = (slot, k) => { for (const r of SLOT_PHRASE) if (r[0].test(slot || '')) return r[k]; return null; };

export function createStore(ctx) {
  const { bus, clock } = ctx;
  const team = ctx.data.team.agents;
  const byId = new Map(team.map((a) => [a.id, a]));
  const subs = new Set();
  let raf = 0;
  const notify = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; subs.forEach((f) => { try { f(); } catch (e) { console.error('[ui]', e); } }); }); };

  const baseStats = (id) => {
    const hh = hash(id), rev = ['argon', 'reva', 'revb'].includes(id);
    return { tasks: 3 + (hh % 7), reviews: rev ? 6 + (hh % 6) : (hh >>> 3) % 4, coffees: (hh >>> 5) % 4, naps: (hh >>> 7) % 3, minutes: 24 + (hh % 140) };
  };
  const state = {
    act: {}, hist: {}, stats: {}, work: {}, status: {},
    asks: [], finished: [], taps: 0, findings: 0, standups: 0,
    routines: { ambient: true, standups: true, daynight: true, camera: true },
  };
  const initAgents = () => { for (const a of team) { state.act[a.id] = null; state.hist[a.id] = []; state.stats[a.id] = baseStats(a.id); state.work[a.id] = 0; state.status[a.id] = 'resting'; } };
  initAgents();

  const floorFromSlot = (slot) => { const m = /-(\d)f(?:-|$)/.exec(slot || ''); return m ? +m[1] - 1 : null; };

  // merged live + static view of an agent
  function agent(id) {
    const t = byId.get(id);
    if (!t && id !== 'you') return null;
    if (id === 'you') return { id: 'you', name: 'You', short: 'You', role: 'Approver', color: '#2b2622', status: 'resting', visible: true, floor: 0 };
    const v = ctx.agents?.get?.(id);
    return {
      id, name: t.name, short: t.short || t.name, role: t.role, seat: t.seat, color: t.color, kind: t.kind,
      floor: v?.floor ?? floorFromSlot(t.home) ?? 0,
      slotId: v?.slotId ?? t.home,
      status: v?.status || state.status[id] || 'resting',
      task: v?.task || '',
      visible: v ? v.visible !== false : t.startVisible !== false,
      pose: v?.pose || 'stand',
    };
  }
  const agents = (visibleOnly = true) => team.map((t) => agent(t.id)).filter((a) => a && (!visibleOnly || a.visible));
  const find = (who) => {
    const q = String(who || '').toLowerCase().replace(/\(.*?\)/g, '').trim();
    if (!q) return null;
    if (q === 'you') return agent('you');
    const t = team.find((a) => a.id === q || a.short?.toLowerCase() === q || a.name.toLowerCase().replace(/\(.*?\)/g, '').trim() === q || a.name.toLowerCase().startsWith(q));
    return t ? agent(t.id) : null;
  };

  // ---- activity text per agent
  const setAct = (id, text, ts = Date.now()) => { if (id && id in state.act && text) { state.act[id] = { text, ts }; notify(); } };
  const activityText = (id) => {
    const a = agent(id); if (!a) return '';
    const cur = state.act[id];
    if (cur && cur.text) return cur.text;
    if (a.task) return a.task;
    return a.status === 'working' ? 'Heads down' : a.status === 'waiting' ? 'Waiting on you' : a.status === 'error' ? 'Something broke' : 'Resting at their desk';
  };

  const bump = (id, k) => { if (state.stats[id]) { state.stats[id][k]++; notify(); } };

  bus.on('agent:status', ({ id, state: st, task }) => {
    if (!(id in state.status)) return;
    const prev = state.status[id];
    state.status[id] = st;
    if (task) setAct(id, task);
    if (st === 'finished') {
      bump(id, 'tasks');
      pushFinished({ agent: id, text: task || 'Finished their task', ts: clock.simDate().getTime(), kind: 'done' });
    } else if (prev === 'working' && st === 'resting') bump(id, 'tasks');
    notify();
  });
  bus.on('activity', (e) => {
    if (!e) return;
    const id = e.agent;
    if (state.hist[id]) {
      state.hist[id].unshift({ ts: e.ts, text: e.text, kind: e.kind });
      if (state.hist[id].length > 40) state.hist[id].length = 40;
      if (e.kind !== 'ask') setAct(id, e.text, e.ts);
      if (/review|finding|reviewed/i.test(e.text || '') && e.kind !== 'command') bump(id, 'reviews');
    }
    if (e.kind === 'handoff') pushFinished({ agent: id, text: e.text, ts: e.ts, kind: 'handoff' });
    if (/standup/i.test(e.text || '')) state.standups++;
    notify();
  });
  bus.on('agent:arrive', ({ id, slot }) => {
    const p = phrase(slot, 1); if (p) setAct(id, p);
    if (/^coffee-/.test(slot || '')) bump(id, 'coffees');
    if (/^sofa-/.test(slot || '')) bump(id, 'naps');
    if (/^(present-|conf-3f|corkboard)/.test(slot || '')) bump(id, 'reviews');
  });
  bus.on('agent:depart', ({ id, to }) => { const p = phrase(to, 2); if (p) setAct(id, p); });
  bus.on('agent:ride', ({ id, mode, to }) => setAct(id, mode === 'stairs' ? `Taking the stairs to ${to + 1}F` : `Riding the elevator to ${to + 1}F`));
  bus.on('agent:pose', ({ id, pose }) => { const p = POSE_PHRASE[pose]; if (p && pose !== 'sit-type') setAct(id, p); });

  // ---- approvals / finished
  function pushFinished(item) {
    const key = item.agent + '|' + item.text;
    if (state.finished.some((f) => f.agent + '|' + f.text === key)) return;
    state.finished.unshift(item);
    if (state.finished.length > 8) state.finished.length = 8;
    notify();
  }
  bus.on('ask:open', (a) => {
    if (!state.asks.some((x) => x.id === a.id)) state.asks.push({ ...a, ts: clock.simDate().getTime() });
    notify();
  });
  bus.on('ask:answer', ({ id, choice, agent: who }) => {
    const i = state.asks.findIndex((x) => x.id === id);
    const a = i >= 0 ? state.asks.splice(i, 1)[0] : null;
    state.taps++;
    pushFinished({ agent: who || a?.agent, text: a?.text || 'Decision', choice, ts: clock.simDate().getTime(), kind: 'ask' });
    notify();
  });
  for (const a of ctx.director?.pendingAsks?.() || []) state.asks.push({ ...a, ts: Date.now() });

  bus.on('replay:reset', () => {
    initAgents();
    state.asks = []; state.finished = []; state.taps = 0; state.findings = 0; state.standups = 0;
    notify();
  });

  // minutes-working ticker (sim seconds; ignores paused time)
  setInterval(() => {
    if (clock.paused) return;
    let any = false;
    for (const id in state.status) if (state.status[id] === 'working') { state.work[id] += clock.speed || 1; any = true; }
    if (any) notify();
  }, 1000);

  function statsFor(id) {
    const s = state.stats[id] || baseStats(id);
    return { ...s, minutes: Math.round(s.minutes + (state.work[id] || 0) / 60) };
  }

  function counts() {
    const c = { working: 0, waiting: 0, error: 0, resting: 0, finished: 0 };
    for (const a of agents(true)) c[a.status in c ? a.status : 'resting']++;
    return c;
  }

  function toggleRoutine(id, on) {
    state.routines[id] = on;
    if (id === 'ambient') ctx.director?.setAmbient?.(on);
    bus.emit('routine:toggle', { id, on });
    notify();
  }

  const floorName = (i) => `${i + 1}F ${FLOOR_NAMES[i] || ''}`.trim();

  return {
    state, team, byId, agent, agents, find, activityText, statsFor, counts, toggleRoutine, floorName,
    subscribe: (f) => (subs.add(f), () => subs.delete(f)),
    notify, STATES, FLOOR_NAMES,
  };
}
