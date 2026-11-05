// Entry point. Public site at / (demo data only, embedded FILES). Private live mode at /live/ (Cloudflare Access +
// JWT re-check here), which serves the same files plus the live adapter and the KV-backed event feed.
import { checkAuth, unauthorized } from './gate.js';
import { FILES, LIVE_FILES } from './files.js';
import { verifyAccess, ingest, events } from './live.js';

const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8' };

function serve(map, path, priv) {
  if (path.endsWith('/')) path += 'index.html';
  const body = map[path];
  if (body === undefined) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const ext = path.split('.').pop();
  return new Response(body, {
    headers: {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': priv ? 'private, no-store' : 'private, no-cache',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...(priv ? { 'Referrer-Policy': 'no-referrer' } : {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
    if (path === '/live' || path.startsWith('/live/')) {
      if (path === '/live/api/ingest') return ingest(request, env);             // bearer-token only (Access bypass)
      const who = await verifyAccess(request, env);
      if (!who) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
      if (path === '/live') return Response.redirect(`${url.origin}/live/`, 302);
      if (path === '/live/api/events') return events(request, env);
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      return serve({ ...FILES, ...LIVE_FILES }, path.slice(5), true);
    }
    if (!checkAuth(request, env)) return unauthorized();
    return serve(FILES, path, false);
  },
};
