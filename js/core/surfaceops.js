// Shared semantics for surface state updates (used by world.surfaces.update and anything that previews them).
// op: 'set' (replace) | 'merge' (shallow merge) | 'push' ({path,item}) | 'update' ({path,match,set}) | 'remove' ({path,match}) | 'clear'
export function applySurfaceOp(state, op, data = {}) {
  const s = state && typeof state === 'object' ? { ...state } : {};
  switch (op) {
    case 'set': return data && typeof data === 'object' ? { ...data } : {};
    case 'merge': return { ...s, ...data };
    case 'clear': return {};
    case 'push': {
      s[data.path] = [...(s[data.path] || []), data.item];
      return s;
    }
    case 'update': {
      s[data.path] = (s[data.path] || []).map((it) => (matches(it, data.match) ? { ...it, ...data.set } : it));
      return s;
    }
    case 'remove': {
      s[data.path] = (s[data.path] || []).filter((it) => !matches(it, data.match));
      return s;
    }
    default:
      console.warn('[surface] unknown op', op);
      return s;
  }
}
const matches = (it, m) => Object.entries(m || {}).every(([k, v]) => it?.[k] === v);
