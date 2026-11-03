#!/usr/bin/env bash
# Post-fetch half of the live sync (see SYNC.md). READ-ONLY toward Slack: this never talks to Slack.
#   deploy/live/sync.sh [saved-slack_read_channel-output ...]
# 1. moves any given saved Slack MCP outputs into the private raw dir (~/.config/agent-office/raw, chmod 600)
# 2. turns every raw message newer than the per-channel cursor into office events and POSTs them to /live/api/ingest
#    (bearer token read from ~/.config/agent-office/ingest.env; never printed), then advances the cursor.
#    An empty run still re-POSTs (refreshes the 24 h KV TTL).
set -euo pipefail
cd "$(dirname "$0")/../.."
# one sync at a time (ingest is read-merge-write on KV)
exec 9>"$HOME/.config/agent-office/.sync.lock"; flock -n 9 || { echo "another sync is running" >&2; exit 0; }
RAW="$HOME/.config/agent-office/raw"; mkdir -p "$RAW"; chmod 700 "$RAW"
stamp=$(date +%Y-%m-%dT%H%M%S)
for f in "$@"; do
  [ -f "$f" ] || continue
  chan=$(grep -o 'Channel: #[A-Za-z0-9_-]*' "$f" | head -1 | sed 's/Channel: #//'); chan=${chan:-unknown}
  dest="$RAW/${stamp}_${chan}_sync.json"; n=1; while [ -e "$dest" ]; do dest="$RAW/${stamp}_${chan}_sync_$n.json"; n=$((n+1)); done
  mv "$f" "$dest"; chmod 600 "$dest"
done
exec node deploy/live/slack-to-office.mjs --only-new --ingest --update-cursor
