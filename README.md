# Agent Office

An animated, top-down "agent office" dashboard for Deveyn Hainey. Each agent gets a desk with a little character; the desk animates according to the agent's state (typing, stuck alert, waving, idle/zzz). The goal is to see at a glance **when a bot is stuck or needs you**: the top bar shows a big attention count (red when above zero) with clickable chips naming each stuck / needs-you agent, and every desk shows its state, current task and how long ago it was updated.

Plain HTML/CSS/JS: no build step, no backend, no CDNs, and all paths are relative, so it can be served from any folder (e.g. GitHub Pages project sites).

> **Status:** GitHub Pages is **not enabled yet** and the repository is **private**. Nothing is published until you enable Pages in the repo settings.

Data refreshes on a schedule, not live: the page re-fetches `data/status.json` every 60 s (cache-busted), shows "Last updated" in America/Denver time, and shows a "Stale" warning if the data is older than 2 hours.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` via `file://` won't work because the browser blocks `fetch` of local JSON.)

## File layout

```
index.html
css/style.css
js/app.js
data/agents.json          agent roster (edit to add agents)
data/status.json          current status (written by a scheduled job or the helper script)
scripts/update-status.py  helper to update status.json
```

## JSON schemas

### `data/agents.json`

```json
[
  {"id": "elon", "name": "Elon", "source": "Grok Bot", "role": "Personal work projects, coding", "color": "#6b7cff"}
]
```

`id` (unique, used as the key in status), `name`, `source` (`"Grok Bot"` or `"Claude"`), `role`, optional `color` (any CSS color; otherwise derived from the id). **Adding an agent = adding an entry**; desks auto-layout. Agents that appear in status but not here are ignored; agents here but missing from status show as "No data".

### `data/status.json`

```json
{
  "updated": "2026-11-02T22:08:29Z",
  "agents": {
    "elon": {"state": "working", "task": "one line", "updated": "2026-11-02T22:08:29Z"}
  }
}
```

`state` is one of `working`, `idle`, `stuck`, `needs-you`. Timestamps are ISO 8601 (UTC recommended). `stuck` and `needs-you` count as "needs attention".

## Updating status

`scripts/update-status.py` (Python 3 stdlib only) edits `data/status.json`:

```bash
# one or more agents (flags pair up in order)
python3 scripts/update-status.py --id elon --state working --task "Refactoring parser"
python3 scripts/update-status.py --id mo --state idle --task "Done" --id po --state stuck --task "Needs API key"

# from a JSON file: {"agents": {id: {state, task}}}, {id: {state, task}}, or [{id, state, task}, ...]
python3 scripts/update-status.py --file updates.json
```

Options: `--time ISO` (override timestamp), `--root DIR`. Agents you don't mention keep their previous entry; each updated agent gets the new timestamp, as does the top-level `updated`. Unknown ids produce a warning.

To keep the dashboard current, run it from a scheduled job (a Grok Bot routine, or a GitHub Action / cron) that then commits and pushes `data/status.json`:

```bash
python3 scripts/update-status.py --file updates.json
git add data/status.json && git commit -m "status update" && git push
```
