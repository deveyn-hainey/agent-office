// Private live mode (/live/*): Cloudflare Access protects it at the edge; this module re-checks the Access JWT
// (defence in depth) and serves the event feed from KV. /live/api/ingest is bypassed by Access and instead requires
// the INGEST_TOKEN bearer secret. Nothing here ever talks to Slack.
const MAX_EVENTS = 2500;
const KEEP_MS = 8 * 24 * 3600e3; // events older than this are pruned on ingest
const TTL_S = 24 * 3600;        // KV value expires 24 h after the last ingest
const MAX_BODY = 2e6;           // bytes per ingest request
const MAX_EVENT = 4000;         // bytes per event (snippets are ~140 chars; anything bigger is dropped)

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
const enc = new TextEncoder();
function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

let jwks = null, jwksAt = 0;
async function keys(team, force = false) {
  if (jwks && !force && Date.now() - jwksAt < 3600e3) return jwks;
  if (force && Date.now() - jwksAt < 60e3) return jwks || []; // at most one forced refetch per minute
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs ' + r.status);
  jwks = (await r.json()).keys || []; jwksAt = Date.now();
  return jwks;
}
// Verify the Cf-Access-Jwt-Assertion header: RS256 signature from the team's certs, aud, iss, exp.
export async function verifyAccess(request, env) {
  const tok = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!tok || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  const [h, p, s] = tok.split('.');
  if (!s) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64u(h)));
    const claims = JSON.parse(new TextDecoder().decode(b64u(p)));
    const auds = [].concat(claims.aud || []);
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    if (claims.nbf && claims.nbf * 1000 > Date.now() + 60e3) return null;
    let jwk = (await keys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(env.ACCESS_TEAM_DOMAIN, true)).find((k) => k.kid === header.kid); // key rotation
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), enc.encode(`${h}.${p}`));
    return ok ? claims : null;
  } catch { return null; }
}

async function load(env) {
  const v = await env.LIVE_KV.get('events', 'json');
  return v && Array.isArray(v.events) ? v : { events: [], updated: 0 };
}

export async function ingest(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!env.INGEST_TOKEN || !m || !safeEqual(m[1].trim(), env.INGEST_TOKEN)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (+(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ ok: false, error: 'too large' }, 413);
  let body;
  try { const raw = await request.text(); if (raw.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413); body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const incoming = (Array.isArray(body?.events) ? body.events : []).filter((e) => e && typeof e === 'object' && e.id != null && typeof e.type === 'string' && JSON.stringify(e).length <= MAX_EVENT).slice(0, 5000);
  const cur = body?.replace ? { events: [] } : await load(env);
  const byId = new Map(cur.events.map((e) => [String(e.id), e]));
  let added = 0;
  for (const e of incoming) { if (!byId.has(String(e.id))) added++; byId.set(String(e.id), e); }
  const cutoff = Date.now() - KEEP_MS;
  const events = [...byId.values()].filter((e) => !e.ts || e.ts >= cutoff).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1)).slice(-MAX_EVENTS);
  const updated = Date.now();
  await env.LIVE_KV.put('events', JSON.stringify({ events, updated }), { expirationTtl: TTL_S });
  return json({ ok: true, added, stored: events.length, updated });
}

export async function events(request, env) {
  const since = new URL(request.url).searchParams.get('since') || '';
  const cur = await load(env);
  const out = since ? cur.events.filter((e) => String(e.id) > since) : cur.events;
  return json({ ok: true, updated: cur.updated || 0, events: out });
}
