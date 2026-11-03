// Local dev server for the office: serves the repo at / and /live/, and /live/api/events from a JSON file.
// Usage: node deploy/live/dev-server.mjs [events.json] [port]   (events file: { events:[...] } or a bare array)
// Local only; no auth. Never point it at real data on a shared machine you don't control.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const file = process.argv[2]; const port = +process.argv[3] || 47213;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p === '/live/api/events') {
    let events = [];
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); events = Array.isArray(j) ? j : j.events || []; } catch {}
    const since = u.searchParams.get('since') || '';
    const out = events.filter((e) => !since || String(e.id) > since).sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, updated: Date.now(), events: out }));
  }
  if (p === '/live') { res.writeHead(302, { Location: '/live/' }); return res.end(); }
  if (p.startsWith('/live/')) p = p.slice(5);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root) || /\/(classic|docs|scripts|deploy|\.git)\//.test(f.slice(root.length) + '/') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`office dev server http://127.0.0.1:${port}/  (live: /live/)`));
