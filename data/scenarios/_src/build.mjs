// Scenario generator (S3). Run: node data/scenarios/_src/build.mjs   -> writes intake-huddle.json, hero-review.json, full-demo.json
// Authoring helper only; the app just reads the generated JSON. All content is fictional (Pitchside, acme/pitchside).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..');
const r1 = (n) => Math.round(n * 10) / 10;

class Script {
  constructor() { this.events = []; this.chapters = []; this.t = 0; }
  at(t) { this.t = t; return this; }
  adv(dt) { this.t += dt; return this; }
  e(type, o = {}) { this.events.push({ t: r1(this.t), type, ...o }); return this; }
  chapter(label) { this.chapters.push({ t: r1(this.t), label }); return this; }
  // a spoken line, then advance the cursor by `gap` seconds
  say(agent, text, gap = 4.2, o = {}) { this.e('say', { agent, text, ms: Math.max(3000, Math.min(6500, gap * 1000 + 800)), ...o }); return this.adv(gap); }
  feed(who, text, o = {}) { return this.e('feed', { channel: '#pitchside', who, text, ...o }); }
  // formal Slack line with the role prefix pattern: [Lead · Claude Code] ...
  post(agent, text, o = {}) { return this.e('feed', { channel: '#pitchside', agent, who: NAME[agent], text: `[${PREFIX[agent]}] ${text}`, ...o }); }
  move(agent, to, o = {}) { return this.e('move', { agent, to, ...o }); }
  wait(agents, timeout = 70) { return this.e('waitArrive', { agents, timeout }); }
}

const NAME = {
  lead: 'Lead (Claude Code)', codex: 'Codex', musecode: 'Muse Code', grok: 'Grok', cursor: 'Cursor', argon: 'Argon', chatgpt: 'ChatGPT',
  reva: 'Review agent A', revb: 'Review agent B', ops: 'CI runner', scout: 'Scout', muse: 'Muse',
};
const PREFIX = {
  lead: 'Lead · Claude Code', codex: 'Codex · AI-wiring', musecode: 'Muse Code · Design', grok: 'Grok · Mobile', cursor: 'Cursor · UI',
  argon: 'Argon · Reviewer', chatgpt: 'ChatGPT · Connector', reva: 'Review A · Subagent', revb: 'Review B · Subagent', ops: 'CI runner · scripts/ci-local.sh', scout: 'Scout · Subagent',
};

const XRAY = {
  nodes: [
    { id: 'theme', label: 'packages/theme', group: 'core' }, { id: 'ui', label: 'src/ui', group: 'ui' }, { id: 'odds', label: 'packages/odds', group: 'core' },
    { id: 'feed', label: 'odds/feed.ts', group: 'core' }, { id: 'mobile', label: 'apps/mobile', group: 'app' }, { id: 'mac', label: 'apps/mac', group: 'app' },
    { id: 'ai', label: 'packages/ai-wiring', group: 'core' }, { id: 'design', label: 'design/tokens.json', group: 'design' },
  ],
  edges: [['ui', 'theme'], ['ui', 'odds'], ['odds', 'feed'], ['mobile', 'ui'], ['mac', 'ui'], ['ai', 'odds'], ['theme', 'design']],
};

// =====================================================================================================
// INTAKE & PLANNING HUDDLE  (11 beats)
// =====================================================================================================
function intake(s) {
  const HUDDLE = ['lead', 'chatgpt', 'codex', 'musecode', 'grok', 'cursor'];

  // ---- beat 1: request lands ----
  s.chapter('1 · Request lands');
  s.e('ambient', { on: true });
  s.e('status', { agent: 'lead', state: 'working', task: 'Triaging KAN-142' });
  s.e('camera', { view: 'floor:4', duration: 1.4 });
  s.adv(0.6);
  s.feed('You', 'Can we add a dark-mode toggle to the odds screen? It has to look right on the live-odds chips. (KAN-142)');
  s.e('board', { surface: 'board-4f', title: 'Inbox · KAN-142', request: { who: 'You', text: 'Dark-mode toggle on the odds screen (KAN-142)' } });
  s.e('jira', { key: 'KAN-142', title: 'Dark-mode toggle (request)', col: 'todo', owner: 'lead' });
  s.e('xray', XRAY);
  s.e('log', { agent: 'lead', text: 'New request lands on the 4F whiteboard: KAN-142', kind: 'log' });
  s.adv(1.4);

  // ---- beat 2: heads turn, lead thinks ----
  s.chapter('2 · Heads turn');
  s.e('look', { agents: ['lead', 'chatgpt'], at: 'surface:board-4f' });
  s.adv(1.4);
  s.e('say', { agent: 'lead', style: 'think', ms: 2800, log: 'Lead is reading KAN-142 and the odds screen' });
  s.adv(3.2);
  s.post('lead', 'Got it. Reading KAN-142 and the odds screen now. Checking who is free for a quick huddle.');
  s.say('chatgpt', 'New card on the board: KAN-142. Want me to pull the thread context?', 4.4);
  s.say('lead', 'Yes please. And this touches tokens, UI and device QA, so let us huddle.', 4.6);

  // ---- beat 3: lead stands and calls the huddle ----
  s.chapter('3 · Huddle called');
  s.say('lead', 'Huddle up, everyone! 4F circle. New request, KAN-142.', 2.4, { slack: true });
  s.e('toast', { text: 'Lead called a huddle on 4F', kind: 'info', agent: 'lead' });
  s.move('lead', 'slot:huddle-4f-1');
  s.move('chatgpt', 'free:huddle-4f');
  s.adv(0.8);

  // ---- beat 4: agents walk over (elevator) ----
  s.chapter('4 · Team walks over');
  s.e('camera', { view: 'all', duration: 1.6 });
  s.say('codex', 'Heading up from 2F. Elevator, please.', 0.9, { ms: 3000 });
  s.move('codex', 'free:huddle-4f');
  s.say('cursor', 'Coming. Saving my branch first.', 0.9, { ms: 3000 });
  s.move('cursor', 'free:huddle-4f');
  s.say('grok', 'On my way. Bringing the device list.', 0.9, { ms: 3000 });
  s.move('grok', 'free:huddle-4f');
  s.say('musecode', 'Joining, with the Friday preview scope in mind.', 1.2, { ms: 3000 });
  s.move('musecode', 'free:huddle-4f');
  s.adv(1);
  s.e('spawn', { agent: 'scout', at: 'slot:desk-4f-scout' });
  s.say('lead', 'Spawning Scout to dig up platform dark-mode guidance while we talk.', 3.6, { ms: 3800 });
  s.e('waitArrive', { agents: HUDDLE, timeout: 80 });
  s.e('camera', { view: 'floor:4', duration: 1.4 });
  s.e('look', { agents: HUDDLE, at: 'slot:huddle-4f-1' });
  s.adv(1.2);

  // ---- beat 5: planning dialogue ----
  s.chapter('5 · Planning dialogue');
  s.say('lead', 'Request KAN-142: dark-mode toggle on the odds screen. Ship behind a flag, no layout shift.', 5);
  s.post('lead', 'Intake KAN-142. Constraints: flagged rollout, no layout shift, live-odds chips stay readable. Scope guess: packages/theme, src/ui, apps/mobile.');
  s.say('chatgpt', 'From the thread: wanted before Friday\'s preview build. The Settings screen is out of scope.', 5);
  s.say('musecode', 'Product take: toggle lives in the odds header, not Settings. System / Dark / Light is overkill for v1.', 5.4);
  s.say('codex', 'I will claim the tokens: packages/theme/tokens.ts + useTheme.ts + tests. Dark palette in about 20 min.', 5.4);
  s.post('codex', 'Claiming packages/theme/tokens.ts + packages/theme/useTheme.ts + tests (KAN-143)', { });
  s.e('board', { surface: 'board-4f', note: 'Codex: packages/theme/*' });
  s.say('cursor', 'UI seat. Claiming src/ui/OddsHeader.tsx + src/ui/ThemeToggle.tsx. I will stub with the light palette until tokens land.', 5.6);
  s.post('cursor', 'Claiming src/ui/OddsHeader.tsx + src/ui/ThemeToggle.tsx (KAN-144)');
  s.e('board', { surface: 'board-4f', note: 'Cursor: src/ui/OddsHeader.tsx' });
  s.say('grok', 'Risk: green and red odds chips lose contrast on dark. I will run the device matrix once tokens land.', 5.4);
  s.post('grok', 'Claiming apps/mobile device matrix (iPhone SE, Pixel 6) for KAN-145. Risk: chip contrast on dark.');
  s.e('board', { surface: 'board-4f', note: 'Grok risk: chip contrast' });
  s.e('xray', { highlight: ['theme', 'ui'], agent: 'scout', log: 'X-Ray: packages/theme and src/ui are the blast radius' });
  s.say('scout', 'Scout: both platforms recommend following system appearance by default and remembering an override.', 5.2);
  s.say('lead', 'Logging risks: chip contrast (Grok), token churn touching about 40 files (Codex).', 5);
  s.say('codex', 'Churn is contained: I will alias the old token names. Diff stays under 300 lines.', 4.8);
  s.say('chatgpt', 'Question: persist the choice per user or per device? Per user needs login sync.', 5);
  s.say('musecode', 'Per device. Pitchside has guest browsing; most viewers never sign in.', 4.6);
  s.say('grok', 'Agree. And "system" as the default avoids a surprise on first launch.', 4.6);

  // ---- beat 6: vote ----
  s.chapter('6 · Vote on D-14');
  s.say('lead', 'Proposal D-14: store the theme per device, default to system. YES or NO. Two matching votes lock it.', 3.4);
  s.e('surface', { surface: 'vote-4f', op: 'push', data: { path: 'proposals', item: { id: 'D-14', text: 'Theme stored per device, default = system', yes: 0, no: 0, locked: false, votes: {} } } });
  s.post('lead', 'D-14 · Theme stored per device, default = system. Vote YES/NO in #decisions, two matching votes win.');
  s.e('look', { agents: HUDDLE, at: 'surface:vote-4f' });
  s.adv(1.6);
  s.e('vote', { agent: 'codex', proposal: 'D-14', choice: 'yes' }); s.adv(1.7);
  s.e('vote', { agent: 'chatgpt', proposal: 'D-14', choice: 'no' });
  s.say('chatgpt', 'NO from me: per user is nicer. I will live with it.', 1.8, { ms: 3200 });
  s.e('vote', { agent: 'musecode', proposal: 'D-14', choice: 'yes' }); s.adv(2.2);
  s.e('vote', { agent: 'cursor', proposal: 'D-14', choice: 'yes' }); s.adv(1.2);
  s.e('vote', { agent: 'grok', proposal: 'D-14', choice: 'yes' }); s.adv(2.4);
  s.say('lead', 'D-14 is locked: per device, default to system. Next, D-15.', 3.4, { slack: true });
  s.e('surface', { surface: 'vote-4f', op: 'push', data: { path: 'proposals', item: { id: 'D-15', text: 'Ship behind flag theme_v2, off by default', yes: 0, no: 0, locked: false, votes: {} } } });
  s.say('lead', 'D-15: ship behind the theme_v2 flag, off by default. Votes?', 2.4);
  s.e('vote', { agent: 'musecode', proposal: 'D-15', choice: 'yes' }); s.adv(1.6);
  s.e('vote', { agent: 'grok', proposal: 'D-15', choice: 'yes' }); s.adv(2);
  s.say('lead', 'D-15 locked too. Writing the plan on the board.', 3.2);

  // ---- beat 7: whiteboard fills with plan steps + task cards ----
  s.chapter('7 · Plan on the board');
  const steps = [
    [1, 'Dark palette tokens + useTheme hook', { id: 'c1', title: 'Theme tokens', owner: 'codex', scope: 'packages/theme/*', key: 'KAN-143' }, 'Codex owns the tokens.'],
    [2, 'Toggle component in the odds header', { id: 'c2', title: 'Toggle UI', owner: 'cursor', scope: 'src/ui/OddsHeader.tsx, ThemeToggle.tsx', key: 'KAN-144' }, 'Cursor builds the toggle.'],
    [3, 'Device contrast + a11y pass', { id: 'c3', title: 'Contrast QA', owner: 'grok', scope: 'apps/mobile/e2e/*', key: 'KAN-145' }, 'Grok runs the device matrix.'],
    [4, 'Flag theme_v2, off by default', { id: 'c4', title: 'Rollout flag', owner: 'musecode', scope: 'config/flags.json', key: 'KAN-146' }, 'Muse Code wires the flag.'],
    [5, 'Review gate + scripts/ci-local.sh', { id: 'c5', title: 'Review + CI', owner: 'lead', scope: 'PR gate', key: 'KAN-147' }, 'And I run the review gate.'],
  ];
  for (const [n, text, card, line] of steps) {
    s.e('board', { surface: 'board-4f', step: { n, text }, card });
    s.e('jira', { key: card.key, title: card.title, col: 'todo', owner: card.owner, quiet: true });
    s.say('lead', `${n}. ${text}. ${line}`, 3.6, { ms: 3600 });
  }
  s.e('jira', { key: 'KAN-142', col: 'doing', owner: 'lead', quiet: true });
  s.post('lead', 'Plan for KAN-142 is on the 4F board: 5 steps, 5 cards (KAN-143..147). Owners and file scopes are on the cards.');

  // ---- beat 8: disperse ----
  s.chapter('8 · Disperse');
  s.say('lead', 'Plan is set, claims are in. Heads down. Standup at the top of the hour.', 3.2, { slack: true });
  s.e('release', { agents: ['codex', 'musecode', 'grok', 'cursor', 'chatgpt'] });
  s.e('camera', { view: 'all', duration: 1.6 });
  s.move('codex', 'slot:desk-2f-ai-1'); s.adv(0.4);
  s.move('cursor', 'slot:desk-2f-ui-1'); s.adv(0.4);
  s.move('grok', 'slot:desk-2f-mobile-1'); s.adv(0.4);
  s.move('musecode', 'slot:desk-2f-design-1'); s.adv(0.4);
  s.move('chatgpt', 'slot:desk-4f-chatgpt');
  s.move('lead', 'slot:desk-4f-lead');
  s.e('waitArrive', { agents: ['codex', 'cursor', 'grok', 'musecode', 'chatgpt', 'lead'], timeout: 90 });
  s.adv(0.6);

  // ---- beat 9: heads-down work, standup, handoff, coffee ----
  s.chapter('9 · Heads-down work');
  s.e('camera', { view: 'floor:2', duration: 1.4 });
  s.e('status', { agent: 'codex', state: 'working', task: 'Theme tokens (KAN-143)' });
  s.e('status', { agent: 'cursor', state: 'working', task: 'ThemeToggle shell (KAN-144)' });
  s.e('status', { agent: 'grok', state: 'working', task: 'Device matrix prep (KAN-145)' });
  s.e('status', { agent: 'musecode', state: 'working', task: 'Flag theme_v2 (KAN-146)' });
  s.e('status', { agent: 'chatgpt', state: 'working', task: 'Collecting thread context' });
  s.e('jira', { key: 'KAN-143', col: 'doing', owner: 'codex', quiet: true });
  s.e('jira', { key: 'KAN-144', col: 'doing', owner: 'cursor', quiet: true });
  s.e('jira', { key: 'KAN-145', col: 'doing', owner: 'grok', quiet: true });
  s.e('jira', { key: 'KAN-146', col: 'doing', owner: 'musecode', quiet: true });
  s.e('binder', { agent: 'codex', summary: 'Working KAN-143: dark palette + useTheme hook for Pitchside.', section: 'Active tasks', set: ['KAN-143 Theme tokens (packages/theme/*)'] });
  s.adv(3);
  s.e('xray', { highlight: ['theme', 'design'], log: 'X-Ray: Codex is editing packages/theme (design tokens)' });
  s.say('codex', 'tokens.dark drafted. Aliasing the old names so nothing breaks.', 5, { quiet: false });
  s.say('cursor', 'ThemeToggle renders. Waiting on the real useTheme hook.', 4.8);
  s.e('coffee', { agent: 'grok', line: 'Coffee while the emulator boots.' });
  s.say('musecode', 'Flag theme_v2 added to config/flags.json, default off.', 5);
  s.e('jira', { key: 'KAN-146', col: 'review', owner: 'musecode' });
  s.say('lead', 'Hourly standup: one line each, blockers first.', 4.4, { slack: false });
  s.say('codex', 'Tokens 80%. No blockers.', 3.4);
  s.say('cursor', 'Toggle wired to a stub. Needs Codex hook.', 3.8);
  s.say('chatgpt', 'Thread context posted. Nothing new from the requester.', 4);
  s.e('handoff', { agent: 'codex', recipient: 'cursor', file: 'HANDOFF-2026-11-03.md', text: '[Codex · AI-wiring] HANDOFF-2026-11-03.md written: tokens + useTheme merged on codex/theme-tokens. Cursor, you are up. Scope: src/ui/*, do not touch packages/theme.' });
  s.e('binder', { agent: 'codex', summary: 'KAN-143 done on branch codex/theme-tokens; baton passed to Cursor.', section: 'Active tasks', set: ['KAN-143 Theme tokens: in review'] });
  s.e('jira', { key: 'KAN-143', col: 'review', owner: 'codex' });
  s.say('cursor', 'Picked up the handoff. Wiring ThemeToggle to useTheme now.', 5);
  s.e('binder', { agent: 'cursor', summary: 'Wiring ThemeToggle to useTheme (KAN-144).', section: 'Active tasks', set: ['KAN-144 ThemeToggle + OddsHeader'] });
  s.say('codex', 'Nine unit tests green on my branch. Starting the PR description.', 4.4);
  s.e('jira', { key: 'KAN-144', col: 'review', owner: 'cursor' });
  s.say('grok', 'Back with coffee. Emulator is up on the dark branch.', 4.4);
  s.e('xray', { highlight: ['theme', 'ui', 'mobile'], log: 'X-Ray: blast radius now includes apps/mobile' });
  s.adv(2);

  // ---- beat 10: regroup ----
  s.chapter('10 · Regroup');
  s.say('lead', 'Pencils down. Quick regroup at the circle.', 2.6, { slack: true });
  s.e('camera', { view: 'all', duration: 1.4 });
  s.e('release', { agents: ['grok'] });
  s.move('lead', 'slot:huddle-4f-1');
  for (const a of ['codex', 'cursor', 'grok', 'musecode', 'chatgpt']) { s.move(a, 'free:huddle-4f'); s.adv(0.4); }
  s.e('waitArrive', { agents: HUDDLE, timeout: 90 });
  s.e('camera', { view: 'floor:4', duration: 1.4 });
  s.e('look', { agents: HUDDLE, at: 'slot:huddle-4f-1' });
  s.adv(1);

  // ---- beat 11: present + the human ask ----
  s.chapter('11 · Your call');
  s.say('codex', 'Tokens and useTheme are done. Nine tests green, diff is 287 lines.', 4.6);
  s.say('cursor', 'Toggle is in the header with keyboard support. Screen-reader label still needs a check.', 5.2);
  s.say('grok', 'Contrast: two chips are under 4.5:1 on dark. Fix queued with Codex.', 4.8);
  s.say('musecode', 'Flag theme_v2 is wired, default off.', 3.6);
  s.e('board', { surface: 'board-4f', stepDone: 1 }); s.e('board', { surface: 'board-4f', stepDone: 4 });
  s.say('lead', 'Summing up: 4 of 5 steps done, PR #214 is next for review.', 4.4, { slack: true });
  s.e('ask', {
    agent: 'lead', id: 'ask-1', text: 'Your call: ship dark mode behind the theme_v2 flag first? Approve = flag first, Skip = enable for everyone.',
    options: ['Approve', 'Skip'], next: 'Opening PR #214',
    reply: { Approve: 'Flag first, noted. Opening PR #214 for review.', Skip: 'Understood: enabling for everyone. I will note the risk in PR #214.' },
  });
  s.e('toast', { text: 'Lead is waiting on you', kind: 'warn', agent: 'lead' });
  s.adv(2);
}

// =====================================================================================================
// HERO CODE REVIEW (PR #214)
// =====================================================================================================
const FINDINGS_A = [
  { sev: 'high', text: 'useTheme() reads localStorage during render: hydration flash of the wrong theme on first paint', file: 'packages/theme/useTheme.ts:42', say: 'Found one: storage is read during render. First paint will flash.', cork: 'Hydration flash (useTheme:42)' },
  { sev: 'med', text: 'tokens.dark.oddsUp / oddsDown measure 3.1:1 on surface-2; needs 4.5:1', file: 'packages/theme/tokens.ts:88', say: 'Contrast on the odds chips is 3.1:1. Below the bar.', cork: 'Chip contrast 3.1:1' },
  { sev: 'med', text: 'No test for system to dark switch while the app is open', file: 'packages/theme/useTheme.test.ts', say: 'No test for the live system-to-dark switch.', cork: null },
  { sev: 'low', text: 'colorBgLegacy alias is unused after KAN-143; safe to delete', file: 'packages/theme/tokens.ts:12', say: 'Nit: dead alias, safe to drop.', cork: null },
];
const FINDINGS_B = [
  { sev: 'high', text: 'ThemeToggle has no accessible name; screen readers announce just "button"', file: 'src/ui/ThemeToggle.tsx:17', say: 'ThemeToggle has no accessible name. High for a11y.', cork: 'No aria-label (ThemeToggle:17)' },
  { sev: 'med', text: 'OddsHeader re-renders on every odds tick after a theme change; memoise the chip list (+14 ms on low-end Android)', file: 'src/ui/OddsHeader.tsx:60', say: 'Header re-renders on every tick. Needs a memo.', cork: null },
  { sev: 'med', text: 'Focus ring is #1a1a1a on the dark header: invisible for keyboard users', file: 'src/ui/ThemeToggle.css:12', say: 'Focus ring disappears on the dark header.', cork: 'Focus ring invisible (css:12)' },
  { sev: 'low', text: 'Toggle touch target is 38 px; guideline is 44 px', file: 'src/ui/ThemeToggle.css:4', say: 'Touch target is 38 px. Guideline says 44.', cork: null },
];

function review(s, o = {}) {
  const TEAM2F = ['codex', 'cursor', 'grok', 'musecode'];

  // ---- setup so the scenario also works stand-alone ----
  s.chapter('PR #214 opened');
  s.e('ambient', { on: true });
  s.e('surface', { surface: 'ci-2f', op: 'set', data: { badge: 'local CI', status: 'idle', jobs: [] } });
  s.e('surface', { surface: 'screen-3f-a', op: 'clear', data: {} });
  s.e('surface', { surface: 'screen-3f-b', op: 'clear', data: {} });
  s.e('surface', { surface: 'board-2f', op: 'clear', data: {} });
  s.e('surface', { surface: 'cork-3f', op: 'set', data: { notes: [], strings: [] } });
  s.e('xray', XRAY);
  for (const [key, title, col, owner] of [['KAN-143', 'Theme tokens', 'doing', 'codex'], ['KAN-144', 'Toggle UI', 'doing', 'cursor'], ['KAN-145', 'Contrast QA', 'doing', 'grok'], ['KAN-146', 'Rollout flag', 'review', 'musecode']]) {
    s.e('jira', { key, title, col, owner, quiet: true });
  }
  s.e('camera', { view: 'floor:2', duration: 1.4 });
  s.e('status', { agent: 'codex', state: 'working', task: 'Opening PR #214' });
  s.adv(2.5);
  s.say('codex', 'PR #214 is up: dark-mode toggle + tokens. ci-local.sh is green on my branch.', 4.6, { slack: true });
  s.feed('PR bot', 'PR #214 opened by Codex: feat(theme): dark-mode toggle + tokens (KAN-143, KAN-144) · +287 −41 · 9 files · acme/pitchside');
  s.e('jira', { key: 'KAN-143', col: 'review', owner: 'codex' });
  s.e('jira', { key: 'KAN-144', col: 'review', owner: 'cursor' });
  s.e('xray', { highlight: ['theme', 'ui'], log: 'X-Ray: PR #214 touches packages/theme and src/ui' });
  s.e('status', { agent: 'codex', state: 'working', task: 'PR #214 awaiting review' });
  s.e('binder', { agent: 'codex', summary: 'PR #214 open: dark-mode toggle + tokens (KAN-143/144).', section: 'Active tasks', set: ['PR #214 awaiting review', 'KAN-143 Theme tokens', 'KAN-144 Toggle UI'] });
  s.adv(0.5);

  // ---- lead assigns two reviewers ----
  s.chapter('Lead assigns reviewers');
  s.e('camera', { view: 'floor:4', duration: 1.4 });
  s.e('look', { agents: ['lead', 'chatgpt'], at: 'surface:board-4f' });
  s.e('say', { agent: 'lead', style: 'think', ms: 2600, log: 'Lead is reading PR #214' });
  s.adv(3);
  s.say('lead', 'PR #214 landed. I want two independent reviews, no cross-talk.', 4.4);
  s.post('lead', 'PR #214 (KAN-143/144). Assigning: Review agent A → correctness + state (packages/theme/*). Review agent B → UI + a11y + perf (src/ui/*). Argon gates the result.');
  s.e('spawn', { agent: 'reva', at: 'slot:wander-4f-2' });
  s.e('spawn', { agent: 'revb', at: 'slot:wander-4f-3' });
  s.adv(1.2);
  s.say('reva', 'Review A reporting. Taking correctness and state. Conference Room A.', 4.4);
  s.say('revb', 'Review B reporting. Taking UI, a11y and perf. Room B.', 4.2);
  s.say('lead', 'Separate rooms, separate eyes. Report back when you have evidence.', 3.6);
  s.e('camera', { view: 'all', duration: 1.4 });
  s.move('reva', 'slot:conf-3f-a-1');
  s.adv(0.5);
  s.move('revb', 'slot:conf-3f-b-1');
  s.e('waitArrive', { agents: ['reva', 'revb'], timeout: 90 });
  s.e('camera', { view: 'floor:3', duration: 1.4 });
  s.adv(0.8);

  // ---- both reviewers work in their rooms; screens fill separately ----
  s.chapter('Reviews in Conference Rooms A & B');
  s.e('screen', { screen: 'screen-3f-a', title: 'PR #214 · Review A: correctness & state', agent: 'reva' });
  s.e('screen', { screen: 'screen-3f-b', title: 'PR #214 · Review B: UI, a11y & perf', agent: 'revb' });
  s.e('status', { agent: 'reva', state: 'working', task: 'Reviewing PR #214 · state' });
  s.e('status', { agent: 'revb', state: 'working', task: 'Reviewing PR #214 · UI/a11y' });
  s.e('xray', { highlight: ['theme'], log: 'X-Ray: Review A reading packages/theme' });
  s.adv(1.5);
  s.e('move', { agent: 'argon', to: 'slot:corkboard-3f', quiet: false });
  s.e('say', { agent: 'argon', text: 'I will pin evidence on the corkboard as it arrives.', ms: 4000 });
  s.adv(3.5);
  let corkIdx = [];
  const interleave = [];
  for (let i = 0; i < 4; i++) { interleave.push(['reva', 'screen-3f-a', FINDINGS_A[i]]); interleave.push(['revb', 'screen-3f-b', FINDINGS_B[i]]); }
  let notes = 0;
  for (const [agent, screen, f] of interleave) {
    if (f.say) s.e('say', { agent, text: f.say, ms: 3600, quiet: true });
    s.adv(1.2);
    const fe = { screen, agent, sev: f.sev, text: f.text, file: f.file };
    if (f.cork) { fe.cork = f.cork; corkIdx.push(notes++); if (corkIdx.length >= 2) fe.link = [corkIdx[corkIdx.length - 2], corkIdx[corkIdx.length - 1]]; }
    s.e('finding', fe);
    if (agent === 'revb' && f.sev === 'med') s.e('xray', { highlight: ['ui', 'theme'] });
    s.adv(3.6);
  }
  s.say('argon', 'Pattern: neither theme path has contract tests. Both highs trace back to that.', 4.6);
  s.post('argon', 'Evidence pinned on 3F. Common root cause for both highs: no theme contract tests.');
  s.e('status', { agent: 'reva', state: 'finished', task: 'Review A done: 4 findings' });
  s.e('status', { agent: 'revb', state: 'finished', task: 'Review B done: 4 findings' });
  s.e('binder', { agent: 'reva', summary: 'Review A of PR #214 complete: 4 findings (1 high).', section: 'Review summary', set: FINDINGS_A.map((f) => `${f.sev.toUpperCase()} · ${f.text} (${f.file})`) });
  s.e('binder', { agent: 'revb', summary: 'Review B of PR #214 complete: 4 findings (1 high).', section: 'Review summary', set: FINDINGS_B.map((f) => `${f.sev.toUpperCase()} · ${f.text} (${f.file})`) });
  s.e('binder', { agent: 'argon', summary: 'Gate for PR #214: 8 findings from two independent reviewers.', section: 'Review summary', set: ['2 high · 4 med · 2 low', 'Root cause: no theme contract tests'] });
  s.post('reva', 'PR #214 review A: 4 findings (1 high, 2 med, 1 low). Details on the Conference Room A screen.');
  s.post('revb', 'PR #214 review B: 4 findings (1 high, 2 med, 1 low). Details on the Conference Room B screen.');
  s.adv(1.5);

  // ---- return to 2F, present separately to the dev team ----
  s.chapter('Reviewers present to the dev team');
  s.say('lead', 'Both reviews are in. Reviewers, please present to the team on 2F.', 3.8, { slack: false });
  s.e('camera', { view: 'all', duration: 1.4 });
  s.move('reva', 'slot:present-2f-1');
  s.adv(0.5);
  s.move('revb', 'slot:present-2f-2');
  s.move('codex', 'slot:audience-2f-1'); s.move('cursor', 'slot:audience-2f-2'); s.move('grok', 'slot:audience-2f-3'); s.move('musecode', 'slot:audience-2f-4');
  s.e('waitArrive', { agents: ['reva', 'revb', ...TEAM2F], timeout: 100 });
  s.e('camera', { view: 'floor:2', duration: 1.4 });
  s.e('look', { agents: TEAM2F, at: 'agent:reva' });
  s.e('board', { surface: 'board-2f', title: 'PR #214 · review findings' });
  s.adv(1);

  // Review A presents
  s.e('pose', { agent: 'reva', pose: 'present' });
  s.say('reva', 'Review A, correctness and state. Four findings, one high.', 4.4);
  for (let i = 0; i < 2; i++) {
    const f = FINDINGS_A[i];
    s.e('board', { surface: 'board-2f', card: { id: `a${i + 1}`, title: f.text.slice(0, 54), owner: 'reva', scope: f.file, key: `A-${i + 1}`, status: f.sev } });
    s.say('reva', `${f.sev.toUpperCase()}: ${f.say.replace(/^Found one: /, '')}`, 4.6);
  }
  s.e('board', { surface: 'board-2f', card: { id: 'a3', title: 'Missing system→dark test; dead alias', owner: 'reva', scope: 'packages/theme/*', key: 'A-3', status: 'med' } });
  s.say('codex', 'Hydration flash, fair. I will move the read into an effect with a first-paint default.', 5);
  s.say('grok', 'I will re-measure chip contrast on device after the token fix.', 4.2);
  s.e('look', { agents: TEAM2F, at: 'agent:revb' });

  // Review B presents
  s.e('pose', { agent: 'revb', pose: 'present' });
  s.say('revb', 'Review B, UI and a11y. Four findings, one high.', 4.2);
  for (let i = 0; i < 3; i++) {
    const f = FINDINGS_B[i];
    s.e('board', { surface: 'board-2f', card: { id: `b${i + 1}`, title: f.text.slice(0, 54), owner: 'revb', scope: f.file, key: `B-${i + 1}`, status: f.sev } });
    s.say('revb', `${f.sev.toUpperCase()}: ${f.say}`, 4.6);
  }
  s.say('cursor', 'The label and the focus ring are mine. On it.', 4);
  s.say('musecode', 'Make the touch target 44 px while you are in there.', 4);
  s.post('lead', 'Both reviews in: 8 findings (2 high, 4 med, 2 low). Codex owns A\'s findings, Cursor owns B\'s. Re-run scripts/ci-local.sh when pushed.');
  s.e('pose', { agent: 'reva', pose: 'stand' }); s.e('pose', { agent: 'revb', pose: 'stand' });
  s.adv(1);

  // ---- Codex fixes ----
  s.chapter('Codex & Cursor fix');
  s.e('release', { agents: ['musecode', 'grok'] });
  s.move('codex', 'slot:desk-2f-ai-1'); s.move('cursor', 'slot:desk-2f-ui-1');
  s.e('jira', { key: 'KAN-143', col: 'doing', owner: 'codex' });
  s.e('jira', { key: 'KAN-144', col: 'doing', owner: 'cursor' });
  s.e('waitArrive', { agents: ['codex', 'cursor'], timeout: 60 });
  s.e('status', { agent: 'codex', state: 'working', task: 'Fixing review A findings (PR #214)' });
  s.e('status', { agent: 'cursor', state: 'working', task: 'Fixing review B findings (PR #214)' });
  s.e('xray', { highlight: ['theme', 'ui'], log: 'X-Ray: Codex and Cursor editing theme + ui' });
  s.adv(4);
  s.say('codex', 'Storage read moved into an effect. Chips now at 4.8:1.', 5);
  s.post('codex', 'Pushed 3 commits to PR #214: fix(theme): defer storage read to effect · fix(tokens): chip contrast ≥ 4.5:1 · test(theme): system→dark switch');
  s.say('cursor', 'aria-label added, header chips memoised. Focus ring next.', 5);
  s.post('cursor', 'Pushed 2 commits to PR #214: fix(ui): aria-label on ThemeToggle · perf(ui): memo OddsHeader chips');
  s.e('binder', { agent: 'codex', summary: 'PR #214: review A fixes pushed (3 commits).', section: 'Active tasks', set: ['PR #214 fixes pushed; waiting on local CI'] });
  s.adv(1);

  // ---- CI: amber -> one red -> fixed -> green ----
  s.chapter('Local CI: amber, red, green');
  s.say('lead', 'CI runner, please run scripts/ci-local.sh on PR #214.', 3.4);
  s.move('ops', 'slot:ci-2f');
  s.e('camera', { view: 'floor:2', duration: 1 });
  s.e('waitArrive', { agents: ['ops'], timeout: 60 });
  s.e('look', { agents: ['codex', 'cursor', 'grok'], at: 'surface:ci-2f' });
  s.e('status', { agent: 'ops', state: 'working', task: 'scripts/ci-local.sh' });
  s.say('ops', 'Running scripts/ci-local.sh on PR #214 …', 2.8);
  s.e('ci', { agent: 'ops', badge: 'local CI', overall: 'running', jobs: ['lint', 'typecheck', 'unit tests', 'theme snapshots', 'a11y audit', 'e2e smoke'], status: 'queued', text: 'ci-local.sh started: 6 jobs' });
  s.adv(1.4);
  const run = (job, note, ms = 2.2, st = 'pass') => { s.e('ci', { agent: 'ops', job, status: 'running' }); s.adv(ms); s.e('ci', { agent: 'ops', job, status: st, ...(note ? { note } : {}) }); s.adv(0.5); };
  run('lint'); run('typecheck'); run('unit tests', '41 passed', 3);
  s.e('ci', { agent: 'ops', job: 'theme snapshots', status: 'warn', note: '3 snapshots updated' }); s.adv(2); s.e('ci', { agent: 'ops', job: 'theme snapshots', status: 'pass', note: '3 updated' }); s.adv(0.6);
  s.e('ci', { agent: 'ops', job: 'a11y audit', status: 'running' }); s.adv(2.6);
  s.e('ci', { agent: 'ops', job: 'a11y audit', status: 'fail', note: 'focus ring contrast 2.1:1' });
  s.e('status', { agent: 'ops', state: 'error', task: 'a11y audit failed' });
  s.e('toast', { text: 'CI red: a11y audit', kind: 'bad', agent: 'ops' });
  s.say('ops', 'Red: a11y audit. Focus ring contrast is 2.1:1 (ThemeToggle.css:12).', 4.6, { slack: true });
  s.e('ci', { agent: 'ops', job: 'e2e smoke', status: 'running' });
  s.say('cursor', 'My miss. Focus ring was the one I deferred. Fixing it now.', 4.4);
  s.e('look', { agents: ['codex', 'grok'], at: 'agent:cursor' });
  s.e('status', { agent: 'cursor', state: 'working', task: 'Fixing focus ring contrast' });
  s.adv(3);
  s.e('ci', { agent: 'ops', job: 'e2e smoke', status: 'pass', note: '12 flows' });
  s.post('cursor', 'Pushed fix(ui): focus ring uses --accent (8.2:1) · touch target 44 px');
  s.adv(1.4);
  s.say('ops', 'Re-running a11y audit.', 2.6);
  s.e('status', { agent: 'ops', state: 'working', task: 'Re-running a11y audit' });
  s.e('ci', { agent: 'ops', job: 'a11y audit', status: 'running' }); s.adv(3);
  s.e('ci', { agent: 'ops', job: 'a11y audit', status: 'pass', note: '0 issues' });
  s.e('ci', { agent: 'ops', text: 'ci-local.sh: 6/6 green' });
  s.adv(0.8);

  // ---- celebration ----
  s.chapter('All green: celebration');
  s.e('fx', { kind: 'confetti', at: 'slot:ci-2f' });
  s.e('status', { agent: 'ops', state: 'finished', task: 'Local CI green' });
  s.e('cheer', { agents: ['codex', 'cursor', 'grok', 'musecode', 'ops', 'reva', 'revb'], text: 'Green!', ms: 4500 });
  s.e('toast', { text: 'PR #214 green: scripts/ci-local.sh 6/6', kind: 'good', agent: 'ops' });
  s.say('ops', 'scripts/ci-local.sh: 6/6 green in 41 s.', 3.4, { slack: true });
  s.e('jira', { key: 'KAN-143', col: 'done', owner: 'codex' });
  s.e('jira', { key: 'KAN-144', col: 'done', owner: 'cursor' });
  s.e('jira', { key: 'KAN-142', col: 'review', owner: 'lead', quiet: true });
  s.e('status', { agent: 'codex', state: 'finished', task: 'PR #214 green' });
  s.e('status', { agent: 'cursor', state: 'finished', task: 'PR #214 green' });
  s.e('binder', { agent: 'codex', summary: 'PR #214 green after review fixes; awaiting merge call.', section: 'Active tasks', set: ['PR #214: ci-local.sh 6/6 green'] });
  s.adv(3.5);

  // ---- reviewers nap, lead asks ----
  s.chapter('Reviewers nap; your call');
  s.say('reva', 'My work here is done. Nap time.', 3, { ms: 3000 });
  s.e('nap', { agent: 'reva', hotDesk: false, ms: 90000 });
  s.adv(0.6);
  s.e('nap', { agent: 'revb', hotDesk: false, ms: 90000 });
  s.e('release', { agents: ['codex', 'cursor', 'grok', 'musecode', 'ops'] });
  s.adv(2.4);
  s.e('camera', { view: 'floor:4', duration: 1.6 });
  s.say('lead', 'Review, fixes and CI all done. PR #214 is clean.', 3.8);
  s.e('ask', {
    agent: 'lead', id: 'ask-2', text: 'Your call: merge PR #214 to main now (flag theme_v2 stays off)?',
    options: ['Approve', 'Skip'], next: '',
    reply: { Approve: 'Merging PR #214 to main. KAN-143 and KAN-144 are done.', Skip: 'Holding PR #214. I will keep the branch fresh.' },
  });
  s.e('toast', { text: 'Lead is waiting on you: merge PR #214?', kind: 'warn', agent: 'lead' });
  s.adv(2);
}

function finish(s, def) {
  const evs = s.events.sort((a, b) => a.t - b.t);
  return { id: def.id, title: def.title, summary: def.summary, version: 1, agents: def.agents, chapters: s.chapters, events: evs };
}

function write(name, obj) {
  const { events, chapters, ...head } = obj;
  const body = `{\n${Object.entries(head).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')},\n "chapters": ${JSON.stringify(chapters)},\n "events": [\n${events.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n ]\n}\n`;
  writeFileSync(join(out, name), body);
  console.log(name, 'events:', events.length, 'end t≈', events.at(-1).t);
}

// ---- intake ----
const a = new Script(); intake(a);
write('intake-huddle.json', finish(a, {
  id: 'intake-huddle', title: 'Intake & planning huddle',
  summary: 'A request lands, the lead calls a huddle on 4F, the team plans, claims scopes, votes on D-proposals, fills the board, works, regroups and asks you for a call.',
  agents: ['lead', 'codex', 'musecode', 'grok', 'cursor', 'chatgpt', 'scout'],
}));

// ---- hero review ----
const b = new Script(); review(b);
write('hero-review.json', finish(b, {
  id: 'hero-review', title: 'Hero code review: PR #214',
  summary: 'PR #214 opens, the lead spawns two reviewers into Conference Rooms A and B, findings appear on each screen, they present to the dev team, Codex and Cursor fix, local CI goes amber, red, green, the team celebrates and the reviewers nap.',
  agents: ['lead', 'argon', 'reva', 'revb', 'codex', 'cursor', 'grok', 'musecode', 'ops', 'chatgpt'],
}));

// ---- full demo: intake then review, ending on a summary card ----
const f = new Script(); intake(f);
f.e('waitAnswer', { id: 'ask-1', timeout: 16, auto: true });
f.adv(2);
f.chapter('Hand-off to review');
f.say('lead', 'Thanks. Codex, open the PR so we can review it.', 3.4);
f.e('release', { agents: ['chatgpt', 'scout'] });
f.e('camera', { view: 'all', duration: 1.4 });
f.adv(1.5);
review(f);
f.e('waitAnswer', { id: 'ask-2', timeout: 16, auto: true });
f.adv(2.5);
f.chapter('Summary');
f.e('summary', { title: 'Agent Office: demo summary', lines: ['Intake to plan to PR #214 to green CI', 'Both approvals were a single tap each'] });
write('full-demo.json', finish(f, {
  id: 'full-demo', title: 'Full demo: intake then code review',
  summary: 'Intake huddle and the PR #214 review back to back for the exec demo, ending on a summary card (time, agents, findings caught, human taps).',
  agents: ['lead', 'codex', 'musecode', 'grok', 'cursor', 'chatgpt', 'scout', 'argon', 'reva', 'revb', 'ops'],
}));

// ---- index ----
writeFileSync(join(out, 'index.json'), JSON.stringify({
  scenarios: [
    { id: 'intake-huddle', title: 'Intake & planning huddle', file: 'intake-huddle.json' },
    { id: 'hero-review', title: 'Hero code review: PR #214', file: 'hero-review.json' },
    { id: 'full-demo', title: 'Full demo: intake then review', file: 'full-demo.json' },
  ],
  aliases: { intake: 'intake-huddle', review: 'hero-review', full: 'full-demo', 'full-day': 'full-demo', hero: 'hero-review' },
}, null, 1) + '\n');
