#!/usr/bin/env node
// Dev-only helper: open the app headless and take several screenshots over time (to review a demo "live").
// Usage: node scripts/dev-seq.cjs --q "demo=review&speed=2" --at "10:a,25:b,40:c" [--eval "expr"] [--w 1600 --h 1000]
// Requires playwright (resolved from /workspace/shot-tool); writes /workspace/office-shots/<prefix>-<name>.png. Not part of the shipped app.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/workspace/shot-tool/node_modules/playwright');
const a = process.argv.slice(2), opt = {};
for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) opt[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(opt.w || 1600), height: +(opt.h || 1000) } });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[console.${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  p.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html${opt.q ? '?' + opt.q : ''}`, { waitUntil: 'load' });
  const t0 = Date.now();
  fs.mkdirSync('/workspace/office-shots', { recursive: true });
  for (const step of String(opt.at || '5:x').split(',')) {
    const [sec, name] = step.split(':');
    const wait = +sec * 1000 - (Date.now() - t0);
    if (wait > 0) await p.waitForTimeout(wait);
    if (opt.eval) { try { console.log(name, 'EVAL:', JSON.stringify(await p.evaluate(`(async()=>(${opt.eval}))()`)).slice(0, 1500)); } catch (e) { console.log('EVAL ERROR', e.message); } }
    await p.screenshot({ path: `/workspace/office-shots/${opt.prefix || 's5seq'}-${name}.png` });
    console.log('SHOT', name, 'frames', await p.evaluate('office.scene.frames'), 'demo t', await p.evaluate('office.director.time.toFixed(1)'));
  }
  console.log(logs.length ? logs.join('\n') : 'NO CONSOLE ERRORS');
  await b.close(); srv.close();
});
