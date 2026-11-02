#!/usr/bin/env python3
"""Update data/status.json (and optionally data/activity.json).

Examples:
  python3 scripts/update-status.py --id elon --state working --task "Refactoring parser"
  python3 scripts/update-status.py --id mo --state finished --task "Report sent" --id po --state stuck --task "Needs API key"
  python3 scripts/update-status.py --id elon --state working --task "Fixing tests" --activity "Started fixing tests"
  python3 scripts/update-status.py --log-activity --id mo --state idle --task "Done"
  python3 scripts/update-status.py --file updates.json
  python3 scripts/update-status.py            # just refresh the top-level timestamp

--id/--state/--task may be repeated; they pair up in order.
--activity may be repeated too: the Nth --activity text is logged for the Nth --id.
--log-activity logs every update (using its task text) into activity.json.
--file accepts any of:
  {"agents": {"<id>": {"state": "...", "task": "...", "activity": "optional"}}}
  {"<id>": {"state": "...", "task": "..."}}
  [{"id": "<id>", "state": "...", "task": "..."}]
Agents not mentioned keep their previous entry. activity.json is capped at
200 entries, newest first. Stdlib only.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

STATES = ("working", "finished", "needs-you", "stuck", "idle")
ACTIVITY_CAP = 200


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


def one_line(s):
    return str(s).replace("\n", " ").strip()


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--id", action="append", default=[], help="agent id (repeatable)")
    ap.add_argument("--state", action="append", default=[], help="|".join(STATES))
    ap.add_argument("--task", action="append", default=[], help="one-line task")
    ap.add_argument("--activity", action="append", default=[], help="activity log text for the matching --id (repeatable)")
    ap.add_argument("--log-activity", action="store_true", help="log every update into activity.json")
    ap.add_argument("--file", help="JSON file with updates")
    ap.add_argument("--root", default=os.path.dirname(here), help="repo root (default: parent of scripts/)")
    ap.add_argument("--time", help="override timestamp (ISO 8601, default: now UTC)")
    args = ap.parse_args()

    if not (len(args.id) == len(args.state) == len(args.task)):
        ap.error("--id, --state and --task must be given the same number of times")
    if len(args.activity) > len(args.id):
        ap.error("more --activity values than --id values")

    now = parse_ts(args.time) if args.time else datetime.now(timezone.utc)
    stamp = iso(now)
    data_dir = os.path.join(args.root, "data")
    status_path = os.path.join(data_dir, "status.json")
    activity_path = os.path.join(data_dir, "activity.json")

    updates = {}
    if args.file:
        with open(args.file, encoding="utf-8") as f:
            updates.update(normalize(json.load(f)))
    for n, (i, s, t) in enumerate(zip(args.id, args.state, args.task)):
        u = {"state": s, "task": t}
        if n < len(args.activity):
            u["activity"] = args.activity[n]
        updates[i] = u

    known = {a.get("id") for a in read_json(os.path.join(data_dir, "agents.json"), []) if isinstance(a, dict)}
    status = read_json(status_path, {"agents": {}})
    status.setdefault("agents", {})
    new_activity = []
    for aid, u in updates.items():
        state = u.get("state")
        if state not in STATES:
            sys.exit("invalid state %r for %r (use one of %s)" % (state, aid, ", ".join(STATES)))
        if known and aid not in known:
            print("warning: %r is not in agents.json (it will be ignored by the dashboard)" % aid, file=sys.stderr)
        task = one_line(u.get("task", ""))
        status["agents"][aid] = {"state": state, "task": task, "updated": stamp}
        text = one_line(u["activity"]) if u.get("activity") else (task if args.log_activity and task else "")
        if text:
            new_activity.append({"time": stamp, "agent": aid, "text": text})

    write_json(status_path, {"updated": stamp, "agents": status["agents"]})
    print("wrote", status_path)
    if new_activity:
        old = read_json(activity_path, [])
        if not isinstance(old, list):
            old = []
        write_json(activity_path, (list(reversed(new_activity)) + old)[:ACTIVITY_CAP])
        print("wrote", activity_path, "(+%d)" % len(new_activity))


if __name__ == "__main__":
    main()
