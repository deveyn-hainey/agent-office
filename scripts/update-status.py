#!/usr/bin/env python3
"""Update data/status.json.

Examples:
  python3 scripts/update-status.py --id elon --state working --task "Refactoring parser"
  python3 scripts/update-status.py --id mo --state idle --task "Done" --id po --state stuck --task "Needs API key"
  python3 scripts/update-status.py --file updates.json
  python3 scripts/update-status.py            # just refresh the top-level timestamp

--id/--state/--task may be repeated; they pair up in order.
--file accepts any of:
  {"agents": {"<id>": {"state": "...", "task": "..."}}}
  {"<id>": {"state": "...", "task": "..."}}
  [{"id": "<id>", "state": "...", "task": "..."}]
Agents not mentioned keep their previous entry. Stdlib only.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

STATES = ("working", "idle", "stuck", "needs-you")


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def normalize(raw):
    if isinstance(raw, list):
        return {i["id"]: i for i in raw if isinstance(i, dict) and "id" in i}
    if isinstance(raw, dict):
        if isinstance(raw.get("agents"), dict):
            return raw["agents"]
        return raw
    raise SystemExit("--file must contain a JSON object or array")


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", action="append", default=[], help="agent id (repeatable)")
    ap.add_argument("--state", action="append", default=[], help="working|idle|stuck|needs-you")
    ap.add_argument("--task", action="append", default=[], help="one-line task")
    ap.add_argument("--file", help="JSON file with updates")
    ap.add_argument("--root", default=os.path.dirname(here), help="repo root (default: parent of scripts/)")
    ap.add_argument("--time", help="override timestamp (ISO 8601, default: now UTC)")
    args = ap.parse_args()

    if not (len(args.id) == len(args.state) == len(args.task)):
        ap.error("--id, --state and --task must be given the same number of times")

    now = parse_ts(args.time) if args.time else datetime.now(timezone.utc)
    stamp = iso(now)
    data_dir = os.path.join(args.root, "data")
    status_path = os.path.join(data_dir, "status.json")

    updates = {}
    if args.file:
        with open(args.file, encoding="utf-8") as f:
            updates.update(normalize(json.load(f)))
    for i, s, t in zip(args.id, args.state, args.task):
        updates[i] = {"state": s, "task": t}

    known = {a.get("id") for a in read_json(os.path.join(data_dir, "agents.json"), []) if isinstance(a, dict)}
    status = read_json(status_path, {"agents": {}})
    status.setdefault("agents", {})
    for aid, u in updates.items():
        state = u.get("state")
        if state not in STATES:
            sys.exit("invalid state %r for %r (use one of %s)" % (state, aid, ", ".join(STATES)))
        if known and aid not in known:
            print("warning: %r is not in agents.json (it will be ignored by the dashboard)" % aid, file=sys.stderr)
        status["agents"][aid] = {
            "state": state,
            "task": str(u.get("task", "")).replace("\n", " ").strip(),
            "updated": stamp,
        }
    write_json(status_path, {"updated": stamp, "agents": status["agents"]})
    print("wrote", status_path)


if __name__ == "__main__":
    main()
