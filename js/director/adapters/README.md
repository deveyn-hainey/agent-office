# Adapters (stub — nothing here is implemented or enabled)

The director replays **scenario events** (`docs/ARCHITECTURE.md` §7.3). A future *live, read-only* source (a Slack channel, GitHub PR/CI events, Jira transitions, or a private test workspace) would plug in as an **adapter that translates external events into the same scenario events** and feeds them to the director. The scene never knows whether an event came from a JSON file or an adapter.

## Interface (proposed)
```js
// js/director/adapters/<name>.js   — NOT shipped yet
export function createAdapter(ctx, options) {
  return {
    id: 'slack-readonly',
    enabled: false,                       // must stay false by default; opt-in via local config only
    start(emit) {},                       // begin reading; call emit(event) for each translated event
    stop() {},
  };
}
// emit({ type:'feed', who:'Alice', text:'…' })   → Slack pane/TV
// emit({ type:'board', request:{ who, text } })  → 4F whiteboard card
// emit({ type:'say' | 'move' | 'status' | 'ci' | 'jira' | 'finding' | … })  → agents / boards
```
`emit` would call the director's event dispatcher with `t` set to "now". Events are applied exactly like scripted ones (bubbles, walking, boards, CI wall).

## Rules any adapter must follow
1. **Read-only.** Use read scopes only; never post, react, or edit upstream. No write APIs in the code path.
2. **Server-side, not in the page.** Tokens never reach the browser or this repo. Run a small local proxy that reads upstream and serves *already-sanitised* events as a same-origin static file or local endpoint; the page keeps its "same-origin only" rule.
3. **Sanitise at the boundary.** Map real user ids to the generic agent roster, redact emails/URLs/ids, truncate text, and drop channels not on an allow-list.
4. **Local-only data.** Exports and config live in `local/` or `*.export.json` (git-ignored). Prefer a private test workspace for demos.
5. **Disabled by default**, and visibly labelled in the UI when enabled.

## Where to hook in
- `createDirector(ctx)` in `js/director/index.js` already has a single `dispatch(event)` entry point; an adapter would call it (or a thin `director.ingest(event)` wrapper added at that time).
- Ambient life continues underneath for agents the adapter has not claimed.
