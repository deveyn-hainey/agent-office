# Live office sync (scheduled, read-only)

Feeds the private live office (`https://office.devhain.com/live/`, Cloudflare Access, owner-only) from the team's
Slack channels. **Slack is strictly read-only**: only `slack_read_channel` (and optionally `slack_read_thread`)
are used. Never post, react, edit, delete, join, DM, create canvases or install apps.

Real channel IDs, user IDs and display names live **only** in `~/.config/agent-office/config.json` (gitignored,
outside the repo; shape in `config.example.json`). A filled-in copy of this file with the real channel IDs is kept at
`~/.config/agent-office/SYNC.local.md`. Nothing real is ever committed.

## Files (all chmod 600, outside the repo)
| path | what |
|---|---|
| `~/.config/agent-office/config.json` | channel / user / tag → office agent mapping |
| `~/.config/agent-office/cursor.json` | since-cursor: `{ "<channelId>": "<latest message ts>", "updatedAt": … }` |
| `~/.config/agent-office/raw/` | saved Slack MCP outputs (`{"messages":"Channel: #name (ID)…"}`) |
| `~/.config/agent-office/ingest.env` | `INGEST_URL`, `INGEST_TOKEN` (bearer for `/live/api/ingest`; never print it) |

## Each run (e.g. every 15–30 min)
1. For each channel key in `config.json` → `channels` (build-room, decisions, scratchpad, the project channel):
   read `oldest` = `cursor.json[<channelId>]` (omit on first run → last 48 h), then call the Slack MCP tool
   `slack_read_channel { channel_id: <channelId>, oldest: <cursor>, limit: 100 }`
   with the result **written to a file** (tool option `write_to_file: true`). If `pagination_info` reports more
   messages, repeat with `cursor: <next_cursor>` and save each page too.
   Optional: for a parent with new replies, `slack_read_thread { channel_id, message_ts }`, saved the same way.
2. Post-fetch, one command (from the repo root), passing the saved files:

   ```sh
   deploy/live/sync.sh <saved-file> [<saved-file> …]
   ```

   It moves the files into `~/.config/agent-office/raw/`, runs the transformer on everything newer than the cursor
   (`node deploy/live/slack-to-office.mjs --only-new --ingest --update-cursor`), POSTs the events to
   `/live/api/ingest` and advances `cursor.json`. Zero new messages is fine: the empty POST refreshes the KV TTL.
3. Report only counts (messages / events / stored); never paste message text, names, IDs or the token into chat logs.

## Notes
- KV value `events` expires 24 h after the last ingest; events older than 8 days are pruned; max 2,500 kept.
- Full rebuild from all raw files: `node deploy/live/slack-to-office.mjs --ingest --replace --update-cursor`.
- Dry run (no network): `node deploy/live/slack-to-office.mjs --only-new --out /tmp/x.json` (delete afterwards).
- Snippets are cleaned (links, emails, tokens, code blocks stripped) and cut to ~140 chars before upload.
- The public build never contains `js/director/adapters/live.js` or any event data (`deploy/build.mjs` puts it in
  `LIVE_FILES`, served only under `/live/` after the Access JWT check).
