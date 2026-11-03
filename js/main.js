// Boot + wiring (S0). Everything else is built behind the contracts in docs/ARCHITECTURE.md.
import { createBus } from './core/bus.js';
import { createClock } from './core/clock.js';
import { parseParams, parseView } from './core/util.js';

const getJSON = async (path) => {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

// Live mode: only when served under /live/ (private, behind Cloudflare Access). Locally, ?live=local-test on 127.0.0.1/localhost.
const LIVE = location.pathname.startsWith('/live') || (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && new URLSearchParams(location.search).get('live') === 'local-test');

async function boot() {
  const params = parseParams();
  if (LIVE) { document.body.classList.add('live-mode'); document.title = 'Office Bot · Live'; params.demo = ''; }
  const bus = createBus();
  const clock = createClock(bus);
  const [worldData, team] = await Promise.all([getJSON('data/world.json'), getJSON('data/team.json')]);

  // dynamic imports so a CDN/WebGL failure lands in the fallback instead of a blank page
  const [{ createScene }, { createWorld }, { createAgents }, { createDirector, createReplay }, { createUI }] = await Promise.all([
    import('./core/scene.js'), import('./world/index.js'), import('./agents/index.js'), import('./director/index.js'), import('./ui/index.js'),
  ]);

  const ctx = { bus, clock, params, data: { world: worldData, team } };
  ctx.scene = createScene(document.getElementById('stage'), { bus, clock, world: worldData });
  ctx.cam = ctx.scene.cam;
  ctx.world = createWorld(ctx);
  ctx.agents = createAgents(ctx);
  ctx.cam.setLocator((id) => ctx.agents.getWorldPosition(id));
  ctx.director = createDirector(ctx);
  ctx.replay = createReplay(ctx);
  ctx.ui = createUI(ctx);

  // click/hover picking -> semantic bus events
  const pickables = () => [...(ctx.agents.pickables?.() || []), ...(ctx.world.pickables?.() || [])];
  bus.on('scene:click', ({ clientX, clientY }) => {
    const hit = ctx.scene.pick(clientX, clientY, pickables());
    if (!hit) return bus.emit('pick:click', { pick: null, clientX, clientY });
    const p = hit.pick;
    bus.emit('pick:click', { pick: p, point: hit.point, clientX, clientY });
    bus.emit(`${p.type}:click`, { id: p.id, pick: p, point: hit.point });
  });
  let hoverRaf = 0;
  bus.on('scene:hover', ({ clientX, clientY }) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const hit = ctx.scene.pick(clientX, clientY, pickables());
      ctx.scene.domElement.style.cursor = hit ? 'pointer' : '';
      bus.emit('pick:hover', { pick: hit?.pick || null, clientX, clientY });
    });
  });

  // keep the 3D content clear of the UI panels
  const insets = () => {
    const wide = innerWidth > 1000;
    ctx.cam.setInsets(document.body.classList.contains('clean') || !wide ? { left: 0, right: 0, top: 0, bottom: 0 } : { left: 260, right: 300, top: 50, bottom: 80 });
  };
  insets();
  addEventListener('resize', insets);
  bus.on('cam:clean', insets);

  window.office = { bus, clock, world: ctx.world, agents: ctx.agents, director: ctx.director, replay: ctx.replay, ui: ctx.ui, cam: ctx.cam, scene: ctx.scene, ctx, params };

  // apply URL params
  ctx.cam.setView(parseView(params.view), { animate: false });
  if (params.clean) ctx.cam.setClean(true);
  if (params.speed !== 1) clock.setSpeed(params.speed);
  bus.emit('app:ready', { params });
  if (params.demo) {
    const sc = await ctx.replay.load(params.demo);
    if (sc) {
      if (params.seek > 0) ctx.replay.seek(params.seek);
      ctx.replay.play();
    }
  }
  if (params.paused) clock.pause();
  if (LIVE) {
    try {
      const { createAdapter } = await import('./director/adapters/live.js');
      ctx.live = createAdapter(ctx, {});
      ctx.live.start();
      window.office.live = ctx.live;
    } catch (e) { console.warn('[live] adapter unavailable', e); }
  }
}

boot().catch((e) => {
  console.error(e);
  window.aoFail?.(`Could not start the office: ${e.message || e}`);
});
