# Agent Office v2

A **multi-floor isometric cutaway office** where an AI agent team lives and works. Agents walk with pathfinding, ride the elevator and stairs, type at laptops, get coffee, nap on the lobby sofa, huddle at whiteboards, vote on proposals, present code-review findings and celebrate when CI goes green.

It is a **read-only scenario replay**: everything you see is driven by fictional scripted data (project "Pitchside", repo `acme/pitchside`, tickets `KAN-1xx`, PRs `#2xx`). Nothing is read from or sent to Slack, GitHub, Jira or any network. See [`docs/PRIVACY.md`](docs/PRIVACY.md).

The original v1 dashboard is preserved, untouched, in [`classic/`](classic/) (open `classic/index.html`).

## Run
```bash
python3 -m http.server 8000      # from this folder
# open http://localhost:8000/
```
No build step, no npm dependencies. three.js 0.170.0 is loaded from the jsDelivr CDN through the import map in `index.html`; everything else is same-origin static files.

With no URL parameters you get **ambient office life** (coffee runs, water-cooler banter, naps, standups) with a visible **✨ Demo mode** button (top bar) that runs the full exec demo hands-free. Nothing autoplays.

## Controls
| Control | Action |
|---|---|
| Bottom nav | **All floors** · **‹ 1F 2F 3F 4F ›** floor view · **Clean view** (hides panels) · **− / +** zoom · Chat · Map |
| Mouse | wheel = zoom, drag = pan, click an agent = **desk view** (stats, binder, chat input), click the yellow `!` = jump to its approval card, double-click the 4F board or X-Ray = project map |
| Left panel | floors list, **Waiting on me** (Approve / Skip), Finished, **Routines** toggles (ambient life, hourly standups, day/night lighting, **auto camera follow**), Project map |
| Top bar | status pill, scenario picker, play/pause, restart, scrubber with chapter markers, 1×/2×/4× speed, Demo mode |
| Right panel | bots on the focused floor, live activity log |
| Command box | free-text requests (grammar below) |

Keyboard: `1`–`4` floors · `A` all floors · `C` clean view · `M` project map · `S` chat pane · `/` focus the command box · `Space` play/pause · `Esc` closes the top-most thing (summary → binder → map → drawers → desk → floor → clean).

**Auto camera follow:** when on (default) and you have not moved the camera in the last ~20 s (wheel, drag, nav buttons, keys), the director steers the camera to the action. Touch the camera and it stays yours.

## Exec demo script (≈ 8 min at 1×, ≈ 2 min at 4×)
1. Open `http://localhost:8000/`. Point out the ambient life (agents wandering, coffee, naps) and the live clock/lighting (Denver time).
2. Click **✨ Demo mode** (or use `?demo=full`). The camera starts on **All floors**.
3. **0:00 Request lands** — camera drops to **4F**. A request appears on the big whiteboard and in the chat pane; heads turn, the Lead thinks "…".
4. **0:16 Huddle** — the Lead calls everyone; agents walk from 2F and ride the **elevator** (up to three share a car). Camera shows the whole building, then returns to 4F.
5. **0:30–1:30 Planning** — speech bubbles with claims and file scopes, a risk, a question. **#decisions** vote: ballots pop up, two matching votes lock **D-14** (sparkle).
6. **~2:00 Plan on the board** — numbered steps and task cards (owner · scope · KAN key) appear; the Jira board on 2F fills.
7. **~2:15 Disperse / work** — camera to **2F**: typing, a coffee run, an hourly standup, a `HANDOFF-…md` baton pass (binder updates).
8. **~3:15 "Your call"** — the camera swings in on the Lead's desk, yellow **`!`** appears and a **Waiting on me** card shows. **Click Approve** (or wait ~16 s: the full demo auto-approves so it never stalls).
9. **~4:00 Code review (PR #214)** — Lead spawns Review agents A and B, who ride to **3F**, enter **Conference Rooms A and B** (glass doors open, FREE/IN USE sign flips). Each room screen fills with its own findings (high/med/low), Argon pins evidence on the corkboard.
10. **~5:20 Present** — both reviewers return to the **2F team whiteboard** and present separately; Codex and Cursor answer and fix.
11. **~6:10 CI** — the CI runner walks to the **CI wall**: all jobs amber → one **red** (a11y audit) → fixed → **all green**, confetti, everyone cheers, Jira cards move to Done.
12. **~7:10 Naps** — reviewers nap on the **1F sofa**; the Lead asks "merge PR #214?" (camera on the Lead again). Approve → **summary card** (time, agents, findings caught, human taps).
13. **Command box (anytime):** type `tell Muse to draw the bet365 logo on the lobby wall`. A card lands on the 4F whiteboard and a "You" message in chat; heads turn; Muse walks down to the 1F mural and draws a **generic placeholder badge** with the typed words (never real artwork). Also try `huddle everyone`, `Grok take a nap`, `Argon present findings`, `review PR 212`.

Shorter variants: `?demo=intake` (beats 3–8, ~3.7 min) and `?demo=review` (beats 9–12, ~3.5 min).

## URL parameters
| param | meaning |
|---|---|
| `demo=intake\|review\|full` (or a scenario id) | load a scenario and play it; none = ambient only |
| `view=all\|floor:2\|desk:codex` | initial camera (floor **numbers** 1–4); default `all` |
| `speed=2` | clock speed (0.1–16) |
| `seek=60` | fast-forward to scenario second 60 before playing |
| `paused=1` | start paused (combine with `seek` for stills) |
| `clean=1` | clean view (no panels) |
| `ambient=0` | disable ambient office life |
| `debug=1` | debug overlays (nav grid) |

`window.office` exposes `{bus, clock, world, agents, director, replay, ui, cam, scene}` for the console and headless tests.

## Command box grammar
Free text, case-insensitive; names are roster names (Lead, Codex, Muse Code, Muse, Grok, Cursor, Argon, ChatGPT/GPT, CI/ops). Verbs recognised:
- `tell <agent> to draw <words> on the lobby wall` → mural badge · `draw …` defaults to Muse
- `send <agent> to <place>` / `<agent> go to <place>` — places: conference room A/B, lobby, coffee, water cooler, 2F/3F/4F, whiteboard, CI wall, desk …
- `huddle everyone` / `huddle <agents>` · `<agent> take a nap` · `<agent> get coffee`
- `<agent> present findings` · `review PR <n>` · `fix …` · `run CI` · `cheer` · `status` · `help`
- `approve` / `skip` answers the pending "Your call".
- A selected agent (clicked or in desk view) can be addressed as "him / her / them / that one". Unknown input gets "I didn't catch that" from the Lead.

Each command: request card on the 4F whiteboard + "You" line in chat → heads turn → Lead acks → agent acts → card marked done. The desk-view chat box sends `tell <name> …`.

## Architecture
```
index.html            import map + DOM regions (#stage, #ui-root > panels, #command-box …)
css/                  base.css (tokens) · ui.css
data/                 world.json (generated) · team.json · binders.json · scenarios/*.json
js/main.js            boot: params → data → scene → world → agents → director → replay → ui
js/core/              bus · clock · scene (ortho iso camera, CSS2D) · util · surfaceops
js/world/             floors, glass rooms + doors, props, live surfaces (boards/screens), elevator + stairs, lighting, fx
js/agents/            meeple characters, animation, FSM, A* nav, elevator/stairs travel, bubbles
js/director/          scenario runtime, event handlers, ambient life, command parser, camera cues
js/ui/                panels, feeds, controls, overlays (binder, project map, summary)
scripts/              gen-world.mjs · validate-world.mjs · dev-seq.cjs (dev screenshots)
docs/                 ARCHITECTURE.md (the contract) · BRIEF.md · PRIVACY.md · notes/
```
Modules talk only through the **event bus** (`ctx.bus`) and the published APIs documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the director drives `world` and `agents`; the UI only reads state and reacts to bus events. Floors are 0-based indices (0 = 1F).

### Scenario JSON (`data/scenarios/<id>.json`, listed in `index.json`)
```json
{
  "id": "mini", "title": "Mini demo", "agents": ["lead", "codex"],
  "chapters": [{ "t": 0, "label": "Request lands" }],
  "events": [
    { "t": 0,   "type": "camera", "view": "floor:4", "duration": 1.4 },
    { "t": 1,   "type": "feed",   "who": "You", "text": "Add a dark-mode toggle (KAN-142)" },
    { "t": 1,   "type": "board",  "request": { "who": "You", "text": "Dark-mode toggle (KAN-142)" } },
    { "t": 2,   "type": "look",   "agents": ["lead"], "at": "surface:board-4f" },
    { "t": 4,   "type": "say",    "agent": "lead", "text": "Huddle up!" },
    { "t": 5,   "type": "move",   "agent": "codex", "to": "free:huddle-4f" },
    { "t": 5,   "type": "waitArrive", "agents": ["codex"], "timeout": 60 },
    { "t": 6,   "type": "ask",    "agent": "lead", "id": "ask-1", "text": "Your call: ship behind a flag?" }
  ]
}
```
Events run in `t` order on the scenario cursor, which pauses at `waitArrive`/`waitAnswer`; `move` is non-blocking. Event types: `status say move waitArrive waitAnswer look pose surface board feed vote ask toast camera door spawn despawn release fx log ambient marker jira ci screen finding xray binder handoff coffee nap draw present cheer summary` (see `docs/ARCHITECTURE.md` §7.3 and `docs/notes/s3.md`). The big scenarios are generated by `node data/scenarios/_src/build.mjs`; `node scripts/validate-world.mjs` checks slot/surface references. Seeking is a deterministic fast-forward (`clock.seeking`), so the scrubber and `?seek=` work.

## Read-only / privacy design
No network except the three.js CDN and same-origin `data/*.json`; no tokens, real names, emails, Slack ids or real message text; the command box only changes the local simulation. Details in [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Deferred
Live Slack / GitHub / Jira wiring (a read-only adapter that would emit the same scenario events is sketched in [`js/director/adapters/README.md`](js/director/adapters/README.md) — not implemented), real-time agent telemetry, multiplayer, sound.

## Testing (dev)
`node scripts/validate-world.mjs` · headless: `node /workspace/shot-tool/check.js --q "demo=review&seek=90&paused=1&view=floor:3" --wait 6 --shot name` (must print `NO CONSOLE ERRORS`) · `node scripts/dev-seq.cjs --q "demo=review&speed=2" --at "10:a,25:b"` for a screenshot sequence.
