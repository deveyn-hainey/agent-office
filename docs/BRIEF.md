# Agent Office v2 — build brief (shared by every Claude session)

You are one of several Claude Code sessions building "Agent Office v2" in this repo (`/workspace/agent-office`, branch `office-v2-floors`).
An orchestrator coordinates you, integrates, runs a headless browser, and commits. **Do not run git commit/push/checkout/reset.**
Only edit the files your session owns (listed in your task). If you need something from another module, code against the
contract in `docs/ARCHITECTURE.md`; if the contract is missing something, add a short note to `docs/notes/<your-session>.md` and
implement a safe fallback (feature-detect with `?.`), never edit another session's files.

## What it is
A static, no-build web page: a **multi-floor isometric cutaway office** where an AI agent team lives and works, driven by a
**scripted scenario replay** (this is the first, read-only step; live Slack/GitHub wiring comes later and is NOT built now).
Viewers should feel "office life": agents walk with pathfinding, ride the elevator/take stairs between floors, sit and type,
get coffee, chat at the water cooler, nap on the lounge sofa when idle and then grab a free desk, huddle at the whiteboard
with speech bubbles of real planning dialogue, vote, present findings, and celebrate when CI goes green.

## Hard constraints
- Plain ES modules + HTML/CSS, no bundler, no npm runtime deps. three.js **0.170.0** from jsDelivr via the import map
  (`three` and `three/addons/`). Use `CSS2DRenderer` for bubbles/labels. Runs from `python3 -m http.server`.
- **Read-only / privacy**: no network calls except the three.js CDN and same-origin `data/*.json`. No Slack/GitHub API
  code that writes. The command box drives the local scenario only. No tokens, no real people's names, emails, Slack IDs,
  private URLs, or real Slack message text. All scenario content is fictional (project "Pitchside", a sports-odds
  mockup app; repo `acme/pitchside`; tickets `KAN-1xx`; PRs `#2xx`). Agent names are generic product names (see roster).
  The command box example "draw the bet365 logo" must render a generic placeholder badge with the typed words — no
  trademarked artwork.
- Keep everything working on a 1280–1920px desktop; degrade gracefully on narrow screens. Respect `prefers-reduced-motion`.
- Times shown in America/Denver.
- Test: `node /workspace/shot-tool/check.js --q "<query>" --wait 8 [--shot name] [--eval "<js expr>"]` serves the repo,
  opens `index.html?<query>` in headless Chrome (WebGL via SwiftShader), prints console errors, optional screenshot to
  `/workspace/office-shots/<name>.png` (you can Read the png to look at it). Use it. `node --check file.js` for syntax.

## Visual style (from the reference video)
- 2D-looking isometric vector: flat colors (MeshLambert/MeshBasic or toon), **thin dark outlines** (#2b2622, EdgesGeometry
  line segments) on furniture/walls/agents, **cutaway dollhouse floors** (only the two back walls; front walls hidden).
- **Warm cream background** (#f4ecdc), semi-transparent cream UI panels (rgba(255,251,242,.92), 1px #d9ccb3 border).
- **Pastel accent wall per floor**: 4F purple (#cdbcf0), 3F green (#bfe3c6), 2F blue (#bcd6f2), 1F pink (#f3c6d3).
- Semantic colors: green working #3fae5a, yellow waiting #f2b632, red error #e25a4f, grey resting #a49d90, blue finished #4c8dff.
- Serif titles (Georgia/"Iowan Old Style"/serif), sans body, mono activity log (ui-monospace).
- Agents: simple **meeple-like humanoids** (rounded body + head, tiny legs/arms) in their avatar color; walk with leg
  alternation + bob; sit at laptops when working; lie on sofa when napping. Bubbles: white speech bubble with text;
  white "..." thinking; **yellow "!"** = needs human approval.
- Camera: fixed isometric orthographic. Three zoom levels with smooth pan+zoom tweens: **All floors** (4 stacked floors,
  vertical gap so interiors are visible), **Floor view** (one floor, with dotted-outline area labels like "Huddle circle",
  "Conference Room A"), **Desk view** (close on one agent; right panel swaps to that bot's stats + binder + chat input).
- Bottom floating nav: All floors · Floor (‹ 1F 2F 3F 4F ›) · Clean view (hides panels) · − / + zoom.

## Floors (index 0 = 1F at the bottom)
- **4F Strategy** (purple): Lead's front desk (facing the room), huddle circle (6 spots around a round rug) in front of the
  **big whiteboard** (requests + plan steps + task cards), **#decisions vote board** (D-numbered proposals, YES/NO tallies),
  2–3 desks (ChatGPT connector, Grok), small lounge corner, plant, wall clock, window light.
- **3F Review** (green): **Conference Room A** and **Conference Room B** — enclosed glass rooms (translucent glass walls +
  door gap, outlined frames) each with a table, 4 chairs and a **presentation screen** showing that reviewer's live
  findings; Argon reviewer home desk; an evidence corkboard with red string; small lounge.
- **2F Build/Ops** (blue): desk pods grouped by **seat** (Mac app, Mobile, AI-wiring, Design, UI — labeled on the floor
  with dotted areas), **team whiteboard** (where reviewers present to the dev team), **Jira-style board** (To do / Doing /
  Review / Done columns with KAN cards), **CI wall** (big screen: job rows, red/amber/green, "local CI" badge),
  **Repo X-Ray** screen (dependency graph), server rack with blinking LEDs.
- **1F Lobby/Lounge** (pink): entrance doors, reception, **nap sofas** (2–3), coffee bar with machine (steam), water cooler,
  **logo mural wall** (blank wall agents can draw on), **Slack screen** (wall TV mirroring the scenario's channel feed),
  hot desks (free desks agents grab after napping), plants, arcade/foosball optional.
- **Elevator core + stairs** at the same x/z on every floor (elevator doors open/close; car moves; agents fade/ride between
  floors; stairs as a visible zig-zag). Agents visibly travel between floors.

## Roster (data/team.json) — fictional, generic
| id | name | role | seat/home | color |
|---|---|---|---|---|
| lead | Lead (Claude Code) | Lead / PM | 4F lead desk | #d97757 |
| codex | Codex | Engineering | 2F AI-wiring | #3d7be0 |
| musecode | Muse Code | Product strategy | 2F Design | #9b6bff |
| muse | Muse | Fit & geometry research | 3F / 2F Design | #c86bd6 |
| grok | Grok | Device & QA | 2F Mobile | #2f2f35 |
| cursor | Cursor | UI build | 2F UI | #1fa3a3 |
| argon | Argon (reviewer) | Code review | 3F reviewer desk | #e0a03a |
| chatgpt | ChatGPT | Connector / research | 4F | #10a37f |
| reva | Review agent A | Review subagent (spawned) | 3F Conf A | #f06292 |
| revb | Review agent B | Review subagent (spawned) | 3F Conf B | #7e57c2 |
| ops | CI runner | Runs `scripts/ci-local.sh` | 2F CI wall | #6d8a4e |
| scout | Scout | Research subagent | 4F | #ff8a4c |
The human viewer is "You" (the approver); no avatar needed, but approvals are addressed to "you".

## Scenario beats that MUST be demonstrable
**Intake & planning (11 beats)**: 1 request lands (Slack pane + 4F whiteboard card) → 2 heads turn to the board, lead "..."
→ 3 lead stands and calls a huddle → 4 named agents walk (elevator) to the huddle circle → 5 planning dialogue bubbles
(claims with file scopes, seat picks, risks, a question) → 6 vote on a D-proposal (ballot icons; two matching votes lock it)
→ 7 whiteboard fills with numbered plan steps + task cards (owner, scope, KAN key) → 8 disperse to desks/side rooms (scope
chips) → 9 heads-down work (typing, hourly standup bubble, a HANDOFF-YYYY-MM-DD.md baton pass, coffee break) → 10 regroup
→ 11 present + lead asks "Your call: …" (yellow "!" + Waiting-on-me card with Approve/Skip).
**Hero code review**: PR opened → lead assigns two reviewers → Review agent A to Conference Room A, B to Room B (doors,
screens fill with findings separately) → both return to 2F team whiteboard → each presents separate findings to the dev
team (bubbles + board) → Codex fixes → CI runner runs local CI (wall amber → one red job → fixed → all green) → celebration
(agents cheer/jump) → reviewers nap on lobby sofa.
**Ambient office life** always running underneath when not scripted: coffee runs, water-cooler chats with short banter,
naps, monitor flicker, clocks with real time, day/night lighting from real Denver time.
**Command box**: free text like "tell Muse to draw the bet365 logo on the lobby wall", "send Codex to conference room B",
"huddle everyone", "Grok take a nap", "Argon present findings", "review PR 212". The request appears on the whiteboard +
Slack pane (as "You"), heads turn, the named agent walks there and acts (draws a placeholder logo on the mural, etc.).
