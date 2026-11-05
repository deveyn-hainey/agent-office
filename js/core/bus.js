// Tiny pub/sub. on(name, fn) -> off(). '*' receives every event as fn(payload, name);
// 'agent:*' (trailing ':*') receives every event whose name starts with 'agent:' as fn(payload, name).
export function createBus() {
  const map = new Map();
  const get = (n) => map.get(n) || map.set(n, new Set()).get(n);

  function on(name, fn) {
    get(name).add(fn);
    return () => off(name, fn);
  }
  function off(name, fn) {
    map.get(name)?.delete(fn);
  }
  function once(name, fn) {
    const o = on(name, (p, n) => { o(); fn(p, n); });
    return o;
  }
  function call(fn, payload, name) {
    try { fn(payload, name); } catch (e) { console.error(`[bus] handler for "${name}" threw`, e); }
  }
  function emit(name, payload) {
    const exact = map.get(name);
    if (exact) for (const fn of [...exact]) call(fn, payload, name);
    for (const [pat, set] of map) {
      if (pat === name) continue;
      const hit = pat === '*' || (pat.endsWith(':*') && name.startsWith(pat.slice(0, -1)));
      if (hit) for (const fn of [...set]) call(fn, payload, name);
    }
  }
  return { on, off, once, emit };
}
