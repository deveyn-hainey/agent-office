# Deploy: office.devhain.com

Cloudflare Worker `agent-office`, custom domain `office.devhain.com`.

- **Access:** public (no `SITE_PASSWORD` secret is set). `src/gate.js` is an opt-in Basic Auth gate: setting the Worker secret `SITE_PASSWORD` enables it (any username, password = secret); deleting the secret makes the site public again. No password is stored in this repo.
- **Content:** `build.mjs` embeds only the v2 runtime files (index.html, css/, js/, data/world.json, team.json, binders.json, data/scenarios/*.json) into `src/files.js`. classic/, docs/, scripts/, v1 data (status.json, activity.json, agents.json, floors.json) and notes are never deployed. The build fails if a file matches the privacy blocklist.
- **Redeploy:** `node deploy/build.mjs`, then either upload `deploy/dist/execute.js` with the Cloudflare MCP `execute` tool, or run `npx wrangler deploy` from `deploy/`. If a secret is set, it persists between deploys (`keep_bindings`).
