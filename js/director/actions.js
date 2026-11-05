// Reusable "things an agent does" routines. Used by scenario events (coffee/nap/draw/present), the command box and ambient life.
// All are async, cancellable through a token, and snap straight to their end state while clock.seeking.
import { SIP, NAP_Z, WAKE } from './lines.js';

export const CI_JOBS = ['lint', 'typecheck', 'unit tests', 'theme snapshots', 'a11y audit', 'e2e smoke'];

const MINI_FINDINGS = [
  [
    { sev: 'high', text: 'State read during render can flash the wrong value on first paint', file: 'src/theme/useTheme.ts:42' },
    { sev: 'med', text: 'Odds chip colours drop under 4.5:1 contrast on the dark surface', file: 'src/theme/tokens.ts:88' },
    { sev: 'low', text: 'Legacy alias is unused now; safe to delete', file: 'src/theme/legacy.ts:9' },
  ],
  [
    { sev: 'high', text: 'Toggle button has no accessible name (announced as "button")', file: 'src/ui/ThemeToggle.tsx:17' },
    { sev: 'med', text: 'Header re-renders on every odds tick; memoise the chip list', file: 'src/ui/OddsHeader.tsx:60' },
    { sev: 'low', text: 'Focus ring is nearly invisible on the dark header', file: 'src/ui/ThemeToggle.css:12' },
  ],
];

export function createActions(ctx, rt, hooks = {}) {
  const { clock } = ctx;
  const seeking = () => clock.seeking;
  const A = () => ctx.agents;

  const actions = {
    // ---- coffee run: 1F coffee bar, sip, optional return ----
    async coffee(id, tk, o = {}) {
      if (!rt.visible(id)) return false;
      if (seeking()) { A().moveTo(id, 'free:coffee-1f'); return true; }
      rt.activity(id, 'heads down to the coffee bar (1F)', 'move');
      if (!(await rt.go(id, 'free:coffee-1f', tk))) return false;
      rt.pose(id, 'drink', 4500);
      rt.fx('steam', 'slot:coffee-1f-1');
      rt.say(id, o.line || rt.pick(SIP), { ms: 3000 });
      if (!(await rt.sleep(o.stay ?? 5.5, tk))) return false;
      if (o.home !== false) { rt.activity(id, 'back to the desk with coffee', 'move'); await rt.go(id, o.back || 'home', tk); }
      return !tk?.cancelled;
    },

    // ---- nap on the lobby sofa, then (optionally) grab a free hot desk ----
    async nap(id, tk, o = {}) {
      if (!rt.visible(id)) return false;
      if (seeking()) {
        A().moveTo(id, 'free:sofa-1f'); rt.status(id, 'resting', 'Napping on the lobby sofa', { log: false });
        return true;
      }
      rt.activity(id, 'is heading to the lobby sofa for a nap', 'move');
      if (!(await rt.go(id, 'free:sofa-1f', tk))) return false;
      rt.status(id, 'resting', 'Napping on the lobby sofa');
      rt.pose(id, 'nap');
      const total = o.ms != null ? o.ms / 1000 : rt.rand(24, 38);
      let left = total;
      while (left > 0) {
        if (!(await rt.sleep(Math.min(8, left), tk))) return false;
        left -= 8;
        if (left > 0) rt.say(id, rt.pick(NAP_Z), { ms: 2200, log: false });
      }
      if (o.hotDesk === false) return true;
      rt.say(id, rt.pick(WAKE), { ms: 3000 });
      if (!(await rt.sleep(2, tk))) return false;
      if (await rt.go(id, 'free:hot-1f', tk)) {
        rt.status(id, 'working', o.task || 'Hot desk: catching up on notes');
        rt.activity(id, 'grabbed a free hot desk on 1F', 'move');
      }
      return !tk?.cancelled;
    },

    // ---- draw a generic placeholder badge on the lobby mural (never trademark art) ----
    async draw(id, text, tk, o = {}) {
      const label = String(text || 'logo').trim().slice(0, 40) || 'logo';
      const color = rt.team.get(id)?.color || '#d97757';
      const badge = { text: label, color };
      if (seeking()) {
        A().moveTo(id, 'free:mural-1f'); rt.surfaces('mural-1f', 'merge', { badge, progress: 1 });
        return true;
      }
      rt.activity(id, `heads to the lobby mural wall to draw "${label}"`, 'move');
      if (!(await rt.go(id, 'free:mural-1f', tk))) return false;
      rt.status(id, 'working', `Drawing "${label}" on the lobby wall`);
      rt.pose(id, 'draw');
      rt.look(id, 'surface:mural-1f');
      rt.say(id, `Sketching a placeholder badge: “${label}”.`, { ms: 3200 });
      rt.surfaces('mural-1f', 'merge', { badge, progress: 0.05 });
      for (let i = 1; i <= 5; i++) {
        if (!(await rt.sleep(1.4, tk))) return false;
        rt.surfaces('mural-1f', 'merge', { badge, progress: Math.min(1, i / 5) });
      }
      rt.pose(id, 'stand');
      rt.fx('sparkle', 'slot:mural-1f');
      if (o.report !== false) rt.say(id, `Done! “${label}” is up on the lobby wall (generic badge).`, { ms: 4200, slack: true });
      rt.status(id, 'finished', `Drew "${label}" on the lobby wall`);
      return !tk?.cancelled;
    },

    // ---- present findings at the 2F team whiteboard ----
    async present(id, lines, tk, o = {}) {
      if (!rt.visible(id)) return false;
      const spot = o.slot || 'free:present-2f';
      lines = (lines && lines.length ? lines : ['No findings to present: the review binder is empty.']).slice(0, 4);
      if (seeking()) { A().moveTo(id, spot); A().setPose?.(id, 'present'); return true; }
      rt.activity(id, `walks to ${rt.placeLabel(spot)} to present`, 'move');
      if (!(await rt.go(id, spot, tk))) return false;
      rt.pose(id, 'present');
      rt.look(id, 'surface:board-2f');
      for (const line of lines) {
        rt.say(id, line, { ms: 4800, slack: true });
        if (!(await rt.sleep(5.2, tk))) return false;
      }
      rt.pose(id, 'stand');
      return !tk?.cancelled;
    },

    // ---- fix: go to the desk, type, report ----
    async fix(id, what, tk) {
      what = what || 'the reported issue';
      if (seeking()) { A().moveTo(id, 'slot:' + (rt.team.get(id)?.home)); return true; }
      if (!(await rt.go(id, 'home', tk))) return false;
      rt.status(id, 'working', `Fixing ${what}`);
      rt.say(id, `On it: fixing ${what}.`, { ms: 3000 });
      if (!(await rt.sleep(7, tk))) return false;
      rt.say(id, `Fix pushed for ${what}. scripts/ci-local.sh next.`, { ms: 4200, slack: true });
      rt.status(id, 'finished', `Fixed ${what}`);
      return !tk?.cancelled;
    },

    // ---- run local CI at the 2F wall ----
    async runCI(tk, o = {}) {
      const id = o.agent || 'ops';
      const jobs = CI_JOBS.map((name) => ({ name, status: 'queued' }));
      if (seeking()) {
        A().moveTo(id, 'slot:ci-2f');
        rt.surfaces('ci-2f', 'set', { badge: 'local CI', status: 'pass', jobs: jobs.map((j) => ({ ...j, status: 'pass' })) });
        return true;
      }
      rt.activity(id, 'is walking to the CI wall', 'move');
      if (!(await rt.go(id, 'slot:ci-2f', tk))) return false;
      rt.status(id, 'working', 'Running scripts/ci-local.sh');
      rt.say(id, 'Running scripts/ci-local.sh …', { ms: 2800 });
      rt.surfaces('ci-2f', 'set', { badge: 'local CI', status: 'running', jobs });
      rt.activity(id, 'ci-local.sh started (6 jobs)', 'ci');
      for (let i = 0; i < jobs.length; i++) {
        jobs[i] = { ...jobs[i], status: 'running' };
        rt.surfaces('ci-2f', 'merge', { jobs: [...jobs], status: 'running' });
        if (!(await rt.sleep(2.2, tk))) return false;
        jobs[i] = { ...jobs[i], status: 'pass' };
        rt.surfaces('ci-2f', 'merge', { jobs: [...jobs] });
      }
      rt.surfaces('ci-2f', 'merge', { status: 'pass', jobs: [...jobs] });
      rt.activity(id, `ci-local.sh: ${jobs.length}/${jobs.length} green`, 'ci');
      rt.say(id, `scripts/ci-local.sh: ${jobs.length}/${jobs.length} green.`, { ms: 4200, slack: true });
      rt.fx('confetti', 'slot:ci-2f');
      rt.status(id, 'finished', 'Local CI green');
      return !tk?.cancelled;
    },

    // ---- on-demand mini review of a PR (command box: "review PR 212") ----
    async review(pr, tk) {
      const num = pr || 214;
      const A_ = 'reva', B_ = 'revb';
      const rooms = [[A_, 'a', 'screen-3f-a'], [B_, 'b', 'screen-3f-b']];
      rt.say('lead', `Assigning PR #${num}: Review agent A → Conference Room A, B → Room B.`, { ms: 4600, slack: true });
      if (!seeking() && !(await rt.sleep(1.5, tk))) return false;
      for (const [id] of rooms) { hooks.claim?.(id); await A().spawn?.(id, seeking() ? 'free:conf-3f' : 'free:wander-3f'); }
      await Promise.all(rooms.map(async ([id, r, screen], i) => {
        rt.activity(id, `reviewing PR #${num} in Conference Room ${r.toUpperCase()}`, 'log');
        rt.surfaces(screen, 'set', { title: `PR #${num} review`, agent: id, findings: [] });
        await rt.go(id, `free:conf-3f-${r}`, tk);
        rt.status(id, 'working', `Reviewing PR #${num}`);
        for (const f of MINI_FINDINGS[i]) {
          if (!seeking() && !(await rt.sleep(2.6, tk))) return;
          rt.surfaces(screen, 'push', { path: 'findings', item: f });
          hooks.finding?.(id, f);
          rt.activity(id, `flagged ${f.sev.toUpperCase()}: ${f.text} (${f.file})`, 'log');
        }
      }));
      if (tk?.cancelled) return false;
      rt.activity('lead', `Both reviewers finished PR #${num}: 6 findings`, 'log');
      await Promise.all(rooms.map(async ([id], i) => {
        const lines = MINI_FINDINGS[i].map((f) => `${f.sev.toUpperCase()}: ${f.text}`);
        await actions.present(id, lines.slice(0, 2), tk, { slot: `slot:present-2f-${i + 1}` });
        rt.status(id, 'finished', `Presented PR #${num} findings`);
      }));
      rt.say('lead', `PR #${num}: 6 findings across two reviewers. Codex, please take the highs.`, { ms: 4600, slack: true });
      return !tk?.cancelled;
    },

    async cheer(ids, tk) {
      for (const id of ids) { if (!rt.visible(id)) continue; rt.pose(id, 'cheer', 3500); rt.say(id, 'Woo!', { ms: 1800, style: 'cheer', log: false }); }
      return true;
    },
  };
  return actions;
}
