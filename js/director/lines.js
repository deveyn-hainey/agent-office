// Fictional, workplace-friendly ambient chatter about the (fictional) Pitchside project. No real people or data.

// Water-cooler exchanges: [first speaker, second speaker]
export const BANTER = [
  ['Did the odds feed retry finally stop flapping?', 'Only twice since lunch. I call that stable.'],
  ['Our snapshot tests are so green they look suspicious.', 'Never trust a test that has never failed once.'],
  ['Who renamed OddsChip to OddsPill?', 'Not me. I only rename things on Fridays.'],
  ['Coffee machine says "descale me".', 'Same, honestly.'],
  ['The new empty state is adorable. It has a tiny football.', 'Ship the football.'],
  ['I wrote a regex and now I have two problems.', 'Three, if you count the lookbehind.'],
  ['KAN-151 is 90% done.', 'So... half done?'],
  ['Hot take: dark mode is a feature, not a theme.', 'Hot take accepted. Put it in the changelog.'],
  ['Does anyone remember what "final_final_v3.ts" was?', 'A cry for help, I think.'],
  ['The sofa on 1F is basically a standing meeting for your eyelids.', 'I booked it from 2 to 2:15.'],
  ['Pitchside preview build is at 6.2 MB.', 'Down from 7.9. The tree-shaking is paying rent.'],
  ['Live odds just ticked eleven times in a second.', 'That is called a good Saturday.'],
  ['I keep opening the PR template just to admire the checklist.', 'It does have excellent checkboxes.'],
  ['Mock data says Rovers win 3-0 again.', 'Rovers are very consistent. It is fiction.'],
  ['I fixed a bug and it fixed itself back.', 'Ah, the classic round-trip.'],
  ['Is the plant on 4F getting enough light?', 'It has the best window in the building.'],
  ['Standup in five?', 'Standup is a state of mind.'],
  ['The CI wall was all green earlier. I took a photo.', 'Frame it. Hang it by the elevator.'],
  ['What is the TTL on the odds cache again?', 'Thirty seconds. Written on the whiteboard in purple.'],
  ['Someone pinned a corkboard string to the wrong ticket.', 'It adds mystery. Leave it.'],
  ['Elevator took the scenic route again.', 'Stairs are free cardio.'],
  ['I benchmarked the list view. It is fine. It is always fine.', 'The sentence every dev loves to hear.'],
  ['Naming things is still the hardest part.', 'Cache invalidation says hi.'],
  ['We have 14 tabs open on the same ticket.', 'Thirteen are for moral support.'],
  ['Brought a new emoji to the channel.', 'Approved. Limited to three per thread.'],
  ['How is the Android build?', 'Building. Slowly. With dignity.'],
  ['I added a loading skeleton to the odds card.', 'Tasteful or flashy?', ],
  ['Is it a bug if only the demo hits it?', 'It is a demo bug. Different department.'],
];

// Single lines for solo moments
export const SIP = [
  'Fresh pot. Nice.', 'Ahh, the good beans.', 'Double shot, single plan.', 'Caffeine: loaded.', 'This one is for the CI.',
  'Oat latte, extra foam.', 'Coffee first, merge second.',
];
export const STRETCH = [
  'Stretch break!', '*cracks knuckles*', 'Neck roll. Ahh.', 'Ten reps of shoulder rolls.', 'Posture check!',
];
export const PLANT = [
  'Watering the fern.', 'Hydration day for the plant.', 'Growing nicely. Unlike my backlog.',
];
export const NAP_Z = ['Zzz…', 'Zzzz…', '…five more minutes', 'Zz… ship it… zz'];
export const WAKE = ['Recharged. Grabbing a desk.', 'Okay, back at it.', 'Nap done. Debugging time.', 'That was a good 15. Hot desk next.'];

// Quiet "at my desk" mutters and task labels
export const DESK_MUTTER = [
  'Almost there on KAN-152.', 'Rebasing… fingers crossed.', 'One more test case.', 'That diff is surprisingly small.',
  'Lint is happy.', 'Typecheck passes. Suspicious.', 'Writing the HANDOFF note as I go.', 'Reading the odds feed schema again.',
];
export const TASKS = [
  'KAN-151 odds feed retry', 'KAN-152 empty-state polish', 'KAN-153 chip a11y labels', 'Reading packages/odds/feed.ts',
  'Updating snapshots', 'Writing HANDOFF-2026-11-03.md', 'Triage: flaky e2e smoke', 'Prototype: pull-to-refresh',
];

// Hourly standup (lead asks, two others answer). Fictional status lines.
export const STANDUP = {
  lead: ['Hourly standup — one line each. Blockers first.', 'Standup time. What moved, what is stuck?'],
  reply: [
    'Odds feed retry merged to my branch. Nothing blocking.', 'Snapshots updated. Waiting on tokens.', 'Device matrix queued for after lunch.',
    'Empty-state copy approved. Moving to illustrations.', 'No blockers. Tracking KAN-153.', 'Tests green locally. Writing the handoff.',
  ],
};
