// Command-box executor: parsed intent -> staged office behaviour. Local only (nothing is ever sent anywhere).
// Flow per command: "You" lands in Slack + as a request card on the 4F whiteboard -> heads turn -> lead acks ->
// the target agent(s) act -> they report back with a bubble + log line (+ Slack line) and the card is marked done.
import { parseCommand, HELP_EXAMPLES } from './command.js';

export function createCommands(ctx, rt, actions, hooks) {
  const { bus, clock } = ctx;
  const tokens = new Set();
  let selected = null;

  bus.on('agent:click', ({ id }) => { if (id) selected = id; });
  bus.on('cam:view', ({ view }) => { if (view?.type === 'desk' && view.agent) selected = view.agent; });

  const roster = () => (ctx.agents?.list?.() || []).filter((a) => a.visible && rt.team.get(a.id)?.kind !== 'subagent');
  const list = (ids) => ids.map((i) => rt.nameOf(i)).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const DEFAULT_ACTOR = { draw: 'muse', fix: 'codex', present: 'argon', ci: 'ops', review: 'lead' };

  function reviewLines(id) {
    const b = hooks.getBinder?.(id);
    const sec = b?.sections?.find((s) => /review|finding/i.test(s.title));
    const items = sec?.items?.slice(0, 3) || [];
    if (items.length) return items.map((t, i) => (i === 0 ? `Findings: ${t}` : t));
    return b?.summary ? [b.summary] : null;
  }

  async function command(text, { from = 'You' } = {}) {
    text = String(text || '').trim();
    bus.emit('command:submitted', { text });
    rt.slack(from, text, { you: true });
    rt.activity('you', text, 'command');
    if (!text) { const r = { ok: false, summary: 'Type a request, e.g. "huddle everyone".' }; bus.emit('command:result', { text, ...r }); return r; }
    rt.surfaces('board-4f', 'push', { path: 'requests', item: { who: from, text } });

    const p = parseCommand(text, { selected });
    const tk = rt.token();
    tokens.add(tk);
    const finish = (r) => { bus.emit('command:result', { text, ...r }); return r; };

    // heads turn to the request board (those who are on 4F), plus the actor(s)
    const onBoardFloor = (ctx.agents?.list?.() || []).filter((a) => a.visible && a.floor === 3).map((a) => a.id);

    // ---- resolve actors ----
    let actors = p.everyone ? roster().map((a) => a.id) : [...p.agents];
    if (!actors.length && DEFAULT_ACTOR[p.intent]) actors = [DEFAULT_ACTOR[p.intent]];
    if (p.intent === 'huddle' && !actors.length) actors = roster().map((a) => a.id);
    if (p.intent === 'review') actors = ['lead'];
    actors = actors.filter((id) => rt.team.has(id));
    const needsActor = ['go', 'nap', 'coffee', 'cheer'].includes(p.intent);

    rt.camera({ type: 'floor', floor: 3 }); // the request lands on the 4F whiteboard
    onBoardFloor.concat(actors.filter((a) => rt.visible(a))).forEach((id) => rt.look(id, 'surface:board-4f'));
    rt.say('lead', '', { style: 'think', ms: 1600, log: false });

    // ---- unknown / underspecified ----
    if (!p.known) {
      await rt.sleep(1.2, tk);
      const msg = `I didn't catch that. Try “${rt.pick(HELP_EXAMPLES)}”.`;
      rt.say('lead', msg, { ms: 5200, slack: true });
      rt.surfaces('board-4f', 'update', { path: 'requests', match: { who: from, text }, set: { done: true, note: 'needs clarification' } });
      return finish({ ok: false, summary: msg });
    }
    if (needsActor && !actors.length) {
      await rt.sleep(1.0, tk);
      const msg = `Who should I ask? Name an agent, e.g. “send Codex to ${p.place?.label?.replace(/^the /, '') || 'the lobby'}”, or select one first.`;
      rt.say('lead', msg, { ms: 5200, slack: true });
      return finish({ ok: false, summary: msg });
    }

    // ---- ack ----
    const who = list(actors);
    const summaries = {
      go: `${who} → ${p.place?.label || 'there'}`,
      huddle: `${p.everyone || actors.length > 3 ? 'Everyone' : who} → huddle circle (4F)`,
      nap: `${who} takes a nap on the lobby sofa`,
      coffee: `${who} → coffee bar`,
      draw: `${who} draws “${p.text}” on the lobby wall (placeholder badge)`,
      present: `${who} presents findings at the 2F team whiteboard`,
      review: `Lead assigns two reviewers to PR #${p.pr || 214}`,
      fix: `${who} fixes ${p.text || 'the open issue'}`,
      ci: `${who} runs scripts/ci-local.sh`,
      approve: 'Approving what is waiting on you',
      skip: 'Skipping what is waiting on you',
      cheer: `${who} celebrates`,
      status: 'Lead reports the office status',
      help: 'Lead lists example commands',
    };
    const summary = summaries[p.intent];
    if (actors[0] !== 'lead' || p.intent === 'status') {
      await rt.sleep(1.2, tk);
      rt.say('lead', `On it — ${summary}.`, { ms: 3600, slack: true });
    }
    const res = finish({ ok: true, summary });
    rt.activity('lead', `command → ${summary}`, 'command');

    // ---- act (background) ----
    run(p, actors, tk, text, from, summary).catch((e) => console.warn('[director] command failed', e)).finally(() => {
      tokens.delete(tk);
      rt.surfaces('board-4f', 'update', { path: 'requests', match: { who: from, text }, set: { done: true } });
    });
    return res;
  }

  async function run(p, actors, tk, text, from, summary) {
    const claim = (ids) => ids.forEach((id) => hooks.claim?.(id));
    const releaseLater = async (ids, sec = 8) => { await rt.sleep(sec, tk); hooks.release?.(ids); };
    await rt.sleep(1.0, tk);
    if (tk.cancelled) return;
    claim(actors);
    // directed camera: show the whole building while they travel, then settle on the floor where the action is
    const where = { go: rt.floorOf(p.place?.spec), huddle: 3, nap: 0, draw: 0, present: 1, ci: 1, review: 3 }[p.intent];
    if (where != null && !clock.seeking) {
      const far = actors.some((id) => rt.view(id)?.floor !== where);
      if (far) rt.camera('all');
      (async () => {
        for (let i = 0; i < 100 && !tk.cancelled; i++) {
          await rt.sleep(0.5, tk);
          if (actors.every((id) => !rt.visible(id) || ctx.agents.isArrived(id))) break;
        }
        if (!tk.cancelled) rt.camera({ type: 'floor', floor: where });
      })();
    }
    const report = (id, msg, o = {}) => rt.say(id, msg, { ms: 4600, slack: true, ...o });

    switch (p.intent) {
      case 'go': {
        await Promise.all(actors.map(async (id) => {
          const ok = await rt.go(id, p.place.spec, tk);
          if (ok) { report(id, `Here at ${p.place.label === 'their desk' ? 'my desk' : p.place.label}.`); rt.activity(id, `arrived at ${p.place.label}`, 'move'); }
          else if (!tk.cancelled) report(id, `Couldn't get to ${p.place.label} — path is busy.`);
        }));
        break;
      }
      case 'huddle': {
        if (!actors.includes('lead') && p.everyone) actors.unshift('lead');
        claim(actors);
        rt.say('lead', 'Huddle up, please — 4F circle.', { ms: 3600, slack: true });
        const spots = 6;
        const going = actors.map((id, i) => rt.go(id, i < spots ? 'free:huddle-4f' : 'free:wander-4f', tk));
        await Promise.all(going);
        if (tk.cancelled) break;
        actors.forEach((id) => rt.look(id, 'slot:huddle-4f-1'));
        rt.say('lead', `Thanks all. ${actors.length} in the circle. What do we need to align on?`, { ms: 4800, slack: true });
        break;
      }
      case 'nap': {
        await Promise.all(actors.map((id) => actions.nap(id, tk, { hotDesk: false, ms: 26000 })));
        break;
      }
      case 'coffee': {
        await Promise.all(actors.map((id) => actions.coffee(id, tk, { home: true })));
        for (const id of actors) if (!tk.cancelled) report(id, 'Coffee acquired. Back to work.', { slack: false });
        break;
      }
      case 'draw': {
        await Promise.all(actors.map((id) => actions.draw(id, p.text, tk)));
        break;
      }
      case 'present': {
        await Promise.all(actors.map(async (id, i) => {
          const lines = reviewLines(id) || [`Nothing new from ${rt.nameOf(id)}: no open findings. Quiet is good.`];
          rt.surfaces('board-2f', 'merge', { title: `${rt.nameOf(id)} · findings` });
          lines.forEach((t, k) => rt.surfaces('board-2f', 'push', { path: 'notes', item: t }));
          await actions.present(id, lines, tk, { slot: `slot:present-2f-${(i % 2) + 1}` });
        }));
        break;
      }
      case 'review': {
        const pr = p.pr || 214;
        await actions.review(pr, tk);
        hooks.release?.(['reva', 'revb']);
        break;
      }
      case 'fix': {
        await Promise.all(actors.map((id) => actions.fix(id, p.text, tk)));
        break;
      }
      case 'ci': {
        await actions.runCI(tk, { agent: actors[0] });
        break;
      }
      case 'approve':
      case 'skip': {
        const asks = hooks.pendingAsks();
        const ask = actors.length ? asks.find((a) => actors.includes(a.agent)) : asks[0];
        if (!ask) { rt.say('lead', 'Nothing is waiting on you right now.', { ms: 3800, slack: true }); break; }
        const opt = (ask.options || ['Approve', 'Skip']).find((o) => o.toLowerCase().startsWith(p.choice.toLowerCase().slice(0, 4))) || p.choice;
        hooks.answer(ask.id, opt);
        break;
      }
      case 'cheer': {
        await actions.cheer(actors, tk);
        break;
      }
      case 'status': {
        const counts = {};
        for (const a of ctx.agents?.list?.() || []) if (a.visible) counts[a.status] = (counts[a.status] || 0) + 1;
        const bits = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
        rt.say('lead', `Office status: ${bits.join(', ') || 'all quiet'}.`, { ms: 5200, slack: true });
        break;
      }
      case 'help': {
        rt.say('lead', `Try: “${HELP_EXAMPLES.slice(0, 3).join('”, “')}”.`, { ms: 6000, slack: true });
        break;
      }
      default: break;
    }
    if (!tk.cancelled) releaseLater(actors, 6);
  }

  return {
    command,
    cancelAll() { for (const tk of tokens) tk.cancel(); tokens.clear(); },
    get selected() { return selected; },
    setSelected(id) { selected = id; },
    parse: (t) => parseCommand(t, { selected }),
  };
}
