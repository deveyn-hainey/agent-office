# Office Bot

A static, live 3D dashboard showing Deveyn Hainey's AI agents as small characters working in a clean white isometric office building. By default all agents sit together on one shared **Main** floor; the floor is shown open with "Office Bot" on the back wall. Status bubbles, task speech bubbles, a floors list, activity feed and details cards sit on top.

No build step. Everything is plain HTML/CSS/ES modules and works on GitHub Pages. **three.js is loaded from the jsDelivr CDN** (via an import map in `index.html`), so an internet connection is needed. If WebGL or the CDN fails, a fallback message appears and the side panels keep working.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` from `file://` won't work because the page fetches JSON and uses ES modules.)

## Controls

| Action | Input |
| --- | --- |
| Rotate | Drag (touch: one finger) |
| Zoom | Scroll, `+` / `−` buttons (touch: pinch) |
| Pan | Right-drag or `W` `A` `S` `D` (touch: two fingers) |
| Switch floor | `↑` / `↓`, or click a floor in the Floors list (only shown when there is more than one floor) |
| Agent details | Click an agent or its bubble; `Esc` closes |
| Tour | `▶ Tour` slowly orbits the camera (never auto-starts) |

On screens under 768px the side panels become drawers (Floors / Agents / Activity). `prefers-reduced-motion` minimises bobbing and animations.

## File layout

```
index.html            page + import map
css/style.css         UI styles
js/main.js            data loading, UI panels, events
js/scene.js           three.js scene (building, floors, agents, camera)
js/util.js            colors, states, Denver time helpers
data/floors.json      floors (order = floor number)
data/agents.json      agents
data/status.json      live status
data/activity.json    activity feed
data/routines.json    optional, routines card
data/usage.json       optional, usage card
scripts/update-status.py   helper to update status/activity
```

Data is re-fetched every 60 seconds with cache busting. Times are shown in America/Denver.

## Data schemas

**`data/floors.json`** — order is the floor number (first entry = floor 1, at the bottom). The default is a single `Main` floor; the Floors card, floor hint and floor switching are hidden while there is only one floor. Add more entries to get a multi-floor building.
```json
[{"id": "main", "name": "Main"}]
```

**Desks scale automatically.** Every agent in `agents.json` (any source) gets its own desk on its floor. As agents are added the floor grows with extra desk rows (and the building footprint grows with it), and the camera auto-fits so every desk is visible at once. All floors share the footprint of the busiest floor.

**`data/agents.json`** — `color` (hex) is optional, otherwise a color is derived from the id. `floor` is a floor id (default `main`); unknown or missing floors fall back to the first floor. Character shape is chosen deterministically from the id.
```json
[{"id": "elon", "name": "Elon", "source": "Grok Bot", "role": "Coding", "floor": "main", "color": "#4c8dff"}]
```

**`data/status.json`** — states: `working`, `finished`, `needs-you`, `stuck`, `idle`. Agents with no entry show as idle. A status older than 2 hours shows a stale warning.
```json
{"updated": "2026-11-02T22:08:29Z",
 "agents": {"elon": {"state": "working", "task": "Refactoring parser", "updated": "2026-11-02T22:08:29Z"}}}
```

**`data/activity.json`** — newest first; the last 8 are shown.
```json
[{"time": "2026-11-02T22:10:00Z", "agent": "elon", "text": "Started refactoring parser"}]
```

**`data/routines.json`** (optional; the card is hidden if the file is missing or empty)
```json
[{"name": "Morning digest", "schedule": "Daily 07:00", "agent": "info"}]
```

**`data/usage.json`** (optional; the card only appears if the file exists) — a single object or an array of them.
```json
{"label": "Weekly limit", "percent": 31, "resets": "in 3d 14h",
 "items": [{"name": "Elon", "percent": 5.7}, {"name": "Mo", "percent": 5.5}]}
```

## Updating status and activity

Use the helper (Python 3, stdlib only):

```sh
python3 scripts/update-status.py --id elon --state working --task "Refactoring parser" --activity "Started refactor"
python3 scripts/update-status.py --log-activity --id mo --state finished --task "Report sent"
python3 scripts/update-status.py --file updates.json
```

- `--id/--state/--task` repeat and pair up; `--activity` repeats per `--id`; `--log-activity` logs each update's task text.
- Invalid states are rejected; ids missing from `agents.json` produce a warning.
- `activity.json` is capped at 200 entries, newest first.

To automate, run a scheduled job (cron, GitHub Action, or an agent routine) that calls the script and then commits and pushes `data/*.json`; GitHub Pages redeploys and the dashboard picks it up within a minute.
