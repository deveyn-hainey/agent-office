// UI (S4): panels, feeds, controls and overlays wired to the bus. See docs/ARCHITECTURE.md §8–9 and docs/notes/s4.md.
import { createStore } from './state.js';
import { createPanels } from './panels.js';
import { createFeeds } from './feeds.js';
import { createControls } from './controls.js';
import { createOverlays } from './overlays.js';
import { createBoards } from './boards.js';

export function createUI(ctx) {
  const { bus } = ctx;
  const store = createStore(ctx);
  const cam = () => ctx.cam || ctx.scene?.cam;

  // late-bound api shared between the sub-modules
  const api = {};
  const overlays = createOverlays(ctx, store);
  Object.assign(api, overlays);

  const panels = createPanels(ctx, store, api);
  const feeds = createFeeds(ctx, store);
  const controls = createControls(ctx, store, api, panels, feeds);
  const boards = createBoards(ctx, store);

  api.openDeskView = (id) => {
    if (!store.agent(id)) return;
    const c = cam();
    c?.markUser?.();
    if (c?.getView?.().type !== 'desk') bus.emit('ui:desk-request', { id });
    c?.setView({ type: 'desk', agent: id });
  };
  api.closeDeskView = () => {
    const c = cam();
    if (c?.getView?.().type !== 'desk') return;
    c.markUser?.();
    c.setView(panels.prevView || 'all');
  };
  api.escape = () => overlays.escape() || boards.close();

  // picking: click an agent -> desk view; double-click handled in overlays (map)
  bus.on('agent:click', ({ id }) => api.openDeskView(id));
  bus.on('ui:scenario', () => panels.renderAll());

  // default layout: chat pane open on wide screens
  if (innerWidth >= 1500) feeds.slack.setOpen(true);
  else feeds.slack.setOpen(false);

  const ui = {
    toast: (text, opts) => overlays.toast(text, opts),
    openBinder: (id) => overlays.openBinder(id),
    closeBinder: () => overlays.closeBinder(),
    openDeskView: (id) => api.openDeskView(id),
    closeDeskView: () => api.closeDeskView(),
    openProjectMap: () => overlays.openProjectMap(),
    closeProjectMap: () => overlays.closeProjectMap(),
    // additions (docs/notes/s4.md)
    openSlack: (on = true) => feeds.slack.setOpen(on),
    toggleSlack: () => feeds.slack.toggle(),
    get routines() { return { ...store.state.routines }; },
    setRoutine: (id, on) => store.toggleRoutine(id, on),
    showSummary: () => overlays.showSummary(),
    runDemo: () => controls.loadScenario('full'),
    boards,
    store,
  };
  return ui;
}
