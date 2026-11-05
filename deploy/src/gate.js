// Password gate for Agent Office v2 (Cloudflare Worker).
// Opt-in HTTP Basic Auth. If the SITE_PASSWORD secret is NOT set, the site is public.
// If it is set: any username; password must equal the secret. Set with: wrangler secret put SITE_PASSWORD
const REALM = 'Agent Office';

function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] || 0) ^ (eb[i] || 0);
  return diff === 0;
}

export function checkAuth(request, env) {
  const secret = env.SITE_PASSWORD;
  if (!secret) return true; // no secret configured = public site
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  let decoded;
  try { decoded = atob(m[1]); } catch { return false; }
  const i = decoded.indexOf(':');
  if (i < 0) return false;
  return timingSafeEqual(decoded.slice(i + 1), secret);
}

export function unauthorized() {
  return new Response('<!doctype html><title>Password required</title><p>Password required. Any username works.</p>', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
