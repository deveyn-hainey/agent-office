# Deploy: office.devhain.com

Cloudflare Worker `agent-office`, custom domain `office.devhain.com`.

- **Access:** public (no `SITE_PASSWORD` secret is set). `src/gate.js` is an opt-in Basic Auth gate: setting the Worker secret `SITE_PASSWORD` enables it (any username, password = secret); deleting the secret makes the site public again. No password is stored in this repo.
- **Content:** `build.mjs` embeds only the v2 runtime files (index.html, css/, js/, data/world.json, team.json, binders.json, data/scenarios/*.json) into `src/files.js`. classic/, docs/, scripts/, v1 data (status.json, activity.json, agents.json, floors.json) and notes are never deployed. The build fails if a file matches the privacy blocklist.
- **Redeploy:** `node deploy/build.mjs`, then either upload `deploy/dist/execute.js` with the Cloudflare MCP `execute` tool, or run `npx wrangler deploy` from `deploy/`. If a secret is set, it persists between deploys (`keep_bindings`).

## Private live mode (`/live/`)

- **Access:** Cloudflare Access app "Agent Office Live" on `office.devhain.com/live` — policy *Owner only* (one email, One-time PIN login) plus a non-identity service-token policy used for automated checks. A second Access app on `/live/api/ingest` is *bypass*; that path is protected by the `INGEST_TOKEN` Worker secret (bearer) instead. The Worker re-verifies the `Cf-Access-Jwt-Assertion` (RS256, `ACCESS_AUD`, issuer) on every other `/live/*` request.
- **Data:** KV namespace bound as `LIVE_KV` (key `events`, 24 h TTL refreshed on every ingest). `GET /live/api/events?since=<id>`, `POST /live/api/ingest` (`{events:[…], replace?:bool}`).
- **Code split:** `build.mjs` puts `js/director/adapters/live.js` in `LIVE_FILES` (served only under `/live/`); the public `FILES` map never has it. The build also refuses any file matching the static blocklist or the IDs/names in the local `~/.config/agent-office/config.json`.
- **Bindings:** non-secret ids in `live.bindings.json` (KV id, Access team domain + audience) are sent with every deploy; secrets are kept (`keep_bindings: ['secret_text']`).
- **Sync:** see `live/SYNC.md` (read-only Slack reads → `live/sync.sh`).
