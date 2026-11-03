# Privacy & read-only design

Agent Office v2 is a **local, read-only visualisation**. Nothing in it can write to, or even talk to, an external system.

## Guarantees (audited in code)
- **Network:** the only requests are (1) the three.js 0.170.0 modules from the jsDelivr CDN named in the import map in `index.html`, and (2) same-origin `fetch` of static files under `data/` (`world.json`, `team.json`, `binders.json`, `scenarios/*.json`). There is no `WebSocket`, `EventSource`, `XMLHttpRequest`, `sendBeacon`, or any `fetch` to another origin. To re-check: `grep -rnE "fetch\(|WebSocket|XMLHttpRequest|sendBeacon|EventSource" js index.html`.
- **No credentials:** no tokens, API keys, cookies, or login flows exist in the repo. `.gitignore` excludes `local/`, `*.export.json`, `*.local.json` and `.env*`.
- **Fictional content only:** the project is "Pitchside" (a sports-odds mockup), repo `acme/pitchside`, tickets `KAN-1xx`, PRs `#2xx`. Agents carry generic product names. There are no real people's names, emails, Slack user ids, workspace URLs, or real message text. The Slack pane/TV shows lines authored in `data/scenarios/*.json`.
- **The command box is local.** `director.command(text)` only changes the in-browser simulation (whiteboard card, a "You" line in the chat pane, agents walking). The text is never sent anywhere. "Draw the bet365 logo" renders a generic placeholder badge with the typed words, never trademarked artwork.
- **Replay only:** the UI labels the chat pane "Scenario replay · read-only". Approve/Skip buttons answer the scripted ask inside the simulation.

## Legacy data
`data/{agents,status,activity,floors}.json` and `scripts/update-status.py` belong to the frozen v1 app in `classic/`. v2 does not read them.

## Future live feed
See `js/director/adapters/README.md`: a live read-only Slack/GitHub (or private test-workspace) feed would be an adapter that *emits the same scenario events*. It is **not implemented** and must stay disabled by default.
