# Deploy: office.devhain.com

Cloudflare Worker `agent-office`, custom domain `office.devhain.com`.

- **Gate:** HTTP Basic Auth (`src/gate.js`). Any username; the password must equal the Worker secret `SITE_PASSWORD`. The password is not stored in this repo. Fails closed if the secret is missing.
- **Content:** `build.mjs` embeds only the v2 runtime files (index.html, css/, js/, data/world.json, team.json, binders.json, data/scenarios/*.json) into `src/files.js`. classic/, docs/, scripts/, v1 data (status.json, activity.json, agents.json, floors.json) and notes are never deployed. The build fails if a file matches the privacy blocklist.
- **Redeploy:** `node deploy/build.mjs`, then either upload `deploy/dist/execute.js` with the Cloudflare MCP `execute` tool, or run `npx wrangler deploy` from `deploy/`. The secret persists between deploys (`keep_bindings`).
