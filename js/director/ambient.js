// Ambient office life: runs only for agents the scenario (or a command) has NOT claimed, and yields instantly when one is claimed.
// Activities: coffee runs, water-cooler banter pairs, stretching, plant watering, naps -> hot desk, standup bubbles, desk mutters.
import { BANTER, STRETCH, PLANT, DESK_MUTTER, TASKS, STANDUP } from './lines.js';

export function createAmbient(ctx, rt, actions, isClaimed) {
  const { clock } = ctx;
  const busy = new Map(); // agentId -> token
  const cooldown = new Map(); // agentId -> sim time when allowed again
  let enabled = ctx.params?.ambient !== false && ctx.params?.ambient !== 0 && String(ctx.params?.ambient) !== '0';
  let nextCheck = 3;
  let simNow = 0;
  let lastStandup = 0;
  const MAX_ACTIVE = 3;
  const plants = (ctx.data.world.furniture || []).filter((f) => f.type === 'plant');

  const eligible = () => (ctx.agents?.list?.() || []).filter((a) => {
    if (!a.visible || isClaimed(a.id) || busy.has(a.id)) return false;
    if ((cooldown.get(a.id) || 0) > simNow) return false;
    return ctx.agents.isArrived?.(a.id) !== false;
  });

  function begin(ids, name, fn, cool = [10, 25]) {
    const tk = rt.token();
    ids.forEach((id) => busy.set(id, tk));
    (async () => {
      try { await fn(tk); } catch (e) { console.warn('[ambient]', name, e); }
      ids.forEach((id) => {
        if (busy.get(id) === tk) { busy.delete(id); cooldown.set(id, simNow + rt.rand(cool[0], cool[1])); }
      });
      // tidy: if the activity left the agent with stray state, nothing to do (yield cases are handled by the claimer)
    })();
  }

  // called when a claimer takes over an agent: cancel + stop walking
  function yieldAgent(id) {
    const tk = busy.get(id);
    if (!tk) return;
    tk.cancel();
    // other participants of the same activity are cancelled as well (they share the token)
    for (const [k, v] of [...busy]) if (v === tk) busy.delete(k);
    ctx.agents?.stop?.(id);
  }

  const status = (a) => a.status;
  const atHome = (a) => a.slotId === a.home;

  // ---------- activities ----------
  const act = {
    coffee: (a) => begin([a.id], 'coffee', async (tk) => {
      await actions.coffee(a.id, tk, { home: true });
      if (!tk.cancelled && status(rt.view(a.id)) === 'resting') rt.status(a.id, 'working', rt.pick(TASKS), { log: false });
    }),

    banter: (a, b) => begin([a.id, b.id], 'banter', async (tk) => {
      const pair = rt.pick(BANTER);
      rt.activity(a.id, `chats with ${rt.nameOf(b.id)} at the water cooler`, 'move');
      const [ra, rb] = await Promise.all([rt.go(a.id, 'free:cooler-1f', tk), rt.go(b.id, 'free:cooler-1f', tk)]);
      if (tk.cancelled || !ra || !rb) return;
      ctx.agents.lookAt?.(a.id, `agent:${b.id}`);
      ctx.agents.lookAt?.(b.id, `agent:${a.id}`);
      rt.say(a.id, pair[0], { ms: 4200 });
      if (!(await rt.sleep(4.6, tk))) return;
      rt.say(b.id, pair[1], { ms: 4200 });
      if (!(await rt.sleep(4.6, tk))) return;
      if (Math.random() < 0.45) {
        const p2 = rt.pick(BANTER);
        rt.say(b.id, p2[0], { ms: 4200 });
        if (!(await rt.sleep(4.6, tk))) return;
        rt.say(a.id, p2[1], { ms: 4200 });
        if (!(await rt.sleep(4.6, tk))) return;
      }
      await Promise.all([rt.go(a.id, 'home', tk), rt.go(b.id, 'home', tk)]);
    }, [18, 40]),

    stretch: (a) => begin([a.id], 'stretch', async (tk) => {
      rt.pose(a.id, 'cheer', 2600);
      rt.say(a.id, rt.pick(STRETCH), { ms: 2800 });
      await rt.sleep(3.2, tk);
    }, [20, 50]),

    plant: (a) => begin([a.id], 'plant', async (tk) => {
      const pl = rt.pick(plants.filter((p) => p.floor === rt.view(a.id)?.floor).concat(plants));
      if (!pl) return;
      const near = ctx.world.slots(`wander-${pl.floor + 1}f`).sort((s, t) => Math.hypot(s.x - pl.x, s.z - pl.z) - Math.hypot(t.x - pl.x, t.z - pl.z))[0];
      if (!near) return;
      rt.activity(a.id, 'is watering a plant', 'move');
      if (!(await rt.go(a.id, `slot:${near.id}`, tk))) return;
      rt.look(a.id, { floor: pl.floor, x: pl.x, z: pl.z });
      rt.pose(a.id, 'wave', 2800);
      rt.say(a.id, rt.pick(PLANT), { ms: 3000 });
      rt.fx('sparkle', { floor: pl.floor, x: pl.x, z: pl.z });
      if (!(await rt.sleep(4, tk))) return;
      await rt.go(a.id, 'home', tk);
    }, [25, 60]),

    nap: (a) => begin([a.id], 'nap', async (tk) => {
      const after = status(rt.view(a.id)) === 'finished';
      await actions.nap(a.id, tk, { hotDesk: true, task: after ? 'Hot desk: wrapping up notes' : undefined });
      if (tk.cancelled) return;
      await rt.sleep(rt.rand(25, 45), tk);
      if (!tk.cancelled) { await rt.go(a.id, 'home', tk); if (!tk.cancelled) rt.status(a.id, 'working', rt.pick(TASKS), { log: false }); }
    }, [40, 90]),

    wander: (a) => begin([a.id], 'wander', async (tk) => {
      const floor = rt.view(a.id)?.floor ?? 0;
      if (!(await rt.go(a.id, `free:wander-${floor + 1}f`, tk))) return;
      rt.say(a.id, '', { style: 'think', ms: 2200, log: false });
      if (!(await rt.sleep(rt.rand(4, 8), tk))) return;
      await rt.go(a.id, 'home', tk);
    }, [15, 35]),

    settle: (a) => {
      // sit down and look busy: resting agents at home pick up a task
      if (!atHome(a)) return act.wander(a);
      const task = rt.pick(TASKS);
      rt.status(a.id, 'working', task, { log: false });
      if (Math.random() < 0.6) rt.say(a.id, rt.pick(DESK_MUTTER), { ms: 3200, log: false });
      cooldown.set(a.id, simNow + rt.rand(12, 30));
    },

    standup: (list) => begin(list.map((x) => x.id), 'standup', async (tk) => {
      const lead = list.find((x) => x.id === 'lead') || list[0];
      rt.say(lead.id, rt.pick(STANDUP.lead), { ms: 4200 });
      if (!(await rt.sleep(4.6, tk))) return;
      for (const m of list.filter((x) => x !== lead).slice(0, 2)) {
        rt.say(m.id, rt.pick(STANDUP.reply), { ms: 4200 });
        if (!(await rt.sleep(4.6, tk))) return;
      }
    }, [30, 60]),
  };

  function choose() {
    const pool = eligible();
    if (!pool.length) return;
    const shuffled = pool.sort(() => Math.random() - 0.5);

    // finished agents nap first (then a hot desk)
    const fin = shuffled.find((a) => status(a) === 'finished');
    if (fin) return act.nap(fin);

    // strays (e.g. after a scenario or an interrupted chat) drift back to their desk
    const lost = shuffled.find((x) => !atHome(x) && !/^(hot|sofa)-/.test(x.slotId || '') && x.slotId);
    if (lost) return begin([lost.id], 'home', async (tk) => { await rt.go(lost.id, 'home', tk); }, [10, 20]);

    const a = shuffled[0];
    const roll = Math.random();
    const second = shuffled.find((x) => x !== a);
    if (status(a) === 'resting' && atHome(a) && roll < 0.55) return act.settle(a);
    if (ctx.ui?.routines?.standups !== false && simNow - lastStandup > 120 && roll < 0.12 && pool.length >= 3 && !pool.some((x) => isClaimed(x.id))) {
      lastStandup = simNow;
      return act.standup(shuffled.slice(0, 3));
    }
    if (roll < 0.35) return act.coffee(a);
    if (roll < 0.62 && second) return act.banter(a, second);
    if (roll < 0.74) return act.stretch(a);
    if (roll < 0.84) return act.plant(a);
    if (roll < 0.9) return act.nap(a);
    return act.wander(a);
  }

  return {
    get enabled() { return enabled; },
    set(on) {
      enabled = !!on;
      if (!enabled) this.cancelAll();
    },
    claim(id) { yieldAgent(id); },
    cancelAll() {
      const seen = new Set();
      for (const [id, tk] of busy) { if (!seen.has(tk)) { tk.cancel(); seen.add(tk); } ctx.agents?.stop?.(id); }
      busy.clear();
    },
    reset() { this.cancelAll(); cooldown.clear(); nextCheck = simNow + 3; lastStandup = simNow; },
    update(dt) {
      simNow += dt;
      if (!enabled || clock.seeking || dt <= 0) return;
      if (simNow < nextCheck) return;
      nextCheck = simNow + rt.rand(2.5, 5);
      if (busy.size >= MAX_ACTIVE * 1.5) return;
      const active = new Set(busy.values()).size;
      if (active >= MAX_ACTIVE) return;
      choose();
    },
  };
}
