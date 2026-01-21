import { GameState } from './game-state.js';
import { Renderer } from './renderer.js';
import { UIPanels } from './ui-panels.js';
import { MockBridge } from './mock-data.js';
import { LiveBridge } from './bridge.js';
import { CommandCenter } from './commands.js';
import { clamp } from './map.js';

async function init() {
  const state = new GameState();

  const mapCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('mapCanvas'));
  const minimapCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('minimapCanvas'));

  const renderer = new Renderer(mapCanvas, minimapCanvas);
  await renderer.loadTextures();

  const params = new URLSearchParams(window.location.search);
  const demoParam = params.get('demo') === '1';
  const isDevEnvironment =
    window.location.hostname === 'localhost' ||
    window.location.hostname.endsWith('.local');
  // Backwards-compatible alias; prefer `isDevEnvironment` for new code.
  const devToggle = isDevEnvironment;
  let demoOn = demoParam || isDevEnvironment;

  let bridge = demoOn ? new MockBridge(state) : new LiveBridge(state);
  const commands = new CommandCenter(state, bridge);
  const ui = new UIPanels(state, renderer);

  const swapBridge = async (nextBridge, nextDemoOn) => {
    const prev = bridge;
    bridge = nextBridge;
    commands.bridge = bridge;
    prev.disconnect?.();
    await bridge.connect();
    state.pushScoutLine(nextDemoOn ? 'Demo mode engaged.' : 'Live bridge connected.');
  };

  // keep UI in sync
  state.subscribe(() => ui.render());

  // controls: log panel
  const toggleLog = document.getElementById('toggleLog');
  toggleLog.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('log-collapsed');
    toggleLog.setAttribute('aria-pressed', String(!collapsed));
  });

  // controls: demo mode
  const toggleDemo = document.getElementById('toggleDemo');
  toggleDemo.setAttribute('aria-pressed', String(demoOn));
  toggleDemo.addEventListener('click', async () => {
    demoOn = !demoOn;
    toggleDemo.setAttribute('aria-pressed', String(demoOn));
    const next = demoOn ? new MockBridge(state) : new LiveBridge(state);
    await swapBridge(next, demoOn);
  });

  // start bridge
  await bridge.connect();

  // map interactions
  let isPanning = false;
  let panStart = { x: 0, y: 0, cx: 0, cy: 0 };

  let isSelecting = false;
  let selectStart = { x: 0, y: 0 };

  mapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  mapCanvas.addEventListener('mousedown', (e) => {
    // middle button: pan
    if (e.button === 1) {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, cx: renderer.camera.x, cy: renderer.camera.y };
      return;
    }

    // right button: assign
    if (e.button === 2) {
      const wpt = renderer.screenToWorld(e.clientX, e.clientY);
      const region = renderer.regionAt(wpt.x, wpt.y);
      if (region && state.selected.size) {
        commands.assignSelectedTo(region);
      }
      return;
    }

    // left button: select
    if (e.button === 0) {
      mapCanvas.focus();
      const wpt = renderer.screenToWorld(e.clientX, e.clientY);
      const hit = hitTestWorker(state, wpt.x, wpt.y);
      if (hit) {
        state.setSelected([hit.id]);
        commands.assignMode = false;
        renderer.setSelection(false, 0, 0, 0, 0);
        return;
      }

      // drag select
      isSelecting = true;
      selectStart = { x: wpt.x, y: wpt.y };
      renderer.setSelection(true, wpt.x, wpt.y, wpt.x, wpt.y);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      const dx = (e.clientX - panStart.x) / renderer.camera.zoom;
      const dy = (e.clientY - panStart.y) / renderer.camera.zoom;
      renderer.camera.x = panStart.cx - dx;
      renderer.camera.y = panStart.cy - dy;
      clampCamera(renderer, mapCanvas);
    }

    if (isSelecting) {
      const wpt = renderer.screenToWorld(e.clientX, e.clientY);
      renderer.setSelection(true, selectStart.x, selectStart.y, wpt.x, wpt.y);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) isPanning = false;

    if (e.button === 0 && isSelecting) {
      isSelecting = false;
      const r = renderer.selection;
      const x0 = Math.min(r.x0, r.x1);
      const y0 = Math.min(r.y0, r.y1);
      const x1 = Math.max(r.x0, r.x1);
      const y1 = Math.max(r.y0, r.y1);

      const ids = [];
      for (const w of state.workers.values()) {
        if (w.position.x >= x0 && w.position.x <= x1 && w.position.y >= y0 && w.position.y <= y1) {
          ids.push(w.id);
        }
      }
      state.setSelected(ids);
      renderer.setSelection(false, 0, 0, 0, 0);
    }
  });

  mapCanvas.addEventListener('dblclick', (e) => {
    const wpt = renderer.screenToWorld(e.clientX, e.clientY);
    const hit = hitTestWorker(state, wpt.x, wpt.y);
    if (!hit) return;
    renderer.camera.x = hit.position.x;
    renderer.camera.y = hit.position.y;
    clampCamera(renderer, mapCanvas);
  });

  mapCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const prev = renderer.camera.zoom;
    const next = clamp(prev * factor, 0.7, 2.2);

    // zoom around cursor
    const before = renderer.screenToWorld(e.clientX, e.clientY);
    renderer.camera.zoom = next;
    const after = renderer.screenToWorld(e.clientX, e.clientY);

    renderer.camera.x += (before.x - after.x);
    renderer.camera.y += (before.y - after.y);
    clampCamera(renderer, mapCanvas);
  }, { passive: false });

  // minimap navigation
  minimapCanvas.addEventListener('mousedown', (e) => {
    const wpt = renderer.minimapToWorld(e.clientX, e.clientY);
    renderer.camera.x = wpt.x;
    renderer.camera.y = wpt.y;
    clampCamera(renderer, mapCanvas);
  });

  // command card buttons
  for (const b of Array.from(document.querySelectorAll('button.cmd[data-cmd]'))) {
    b.addEventListener('click', () => {
      const cmd = /** @type {any} */ (b.getAttribute('data-cmd'));
      commands.exec(cmd);
    });
  }

  // hotkeys
  window.addEventListener('keydown', (e) => {
    if (e.target && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 's') commands.exec('stop');
    if (key === 'h') commands.exec('hold');
    if (key === 'r') commands.exec('resume');
    if (key === 'a') commands.exec('reassign');
    if (key === 'i') commands.exec('inspect');
    if (key === 'x') commands.exec('terminate');
  });

  // render loop
  function frame() {
    renderer.render(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // initial camera center
  renderer.camera.x = renderer.world.w / 2;
  renderer.camera.y = renderer.world.h / 2;
  clampCamera(renderer, mapCanvas);
}

/**
 * @param {import('./game-state.js').GameState} state
 * @param {number} wx
 * @param {number} wy
 */
function hitTestWorker(state, wx, wy) {
  let best = null;
  let bestD = 999999;
  for (const w of state.workers.values()) {
    const dx = w.position.x - wx;
    const dy = w.position.y - wy;
    const d = Math.hypot(dx, dy);
    if (d < 14 && d < bestD) {
      best = w;
      bestD = d;
    }
  }
  return best;
}

/**
 * @param {import('./renderer.js').Renderer} renderer
 * @param {HTMLCanvasElement} mapCanvas
 */
function clampCamera(renderer, mapCanvas) {
  const { w, h } = renderer.world;
  const mapRect = mapCanvas.getBoundingClientRect();
  const viewW = mapRect.width / renderer.camera.zoom;
  const viewH = mapRect.height / renderer.camera.zoom;

  renderer.camera.x = clamp(renderer.camera.x, viewW / 2, w - viewW / 2);
  renderer.camera.y = clamp(renderer.camera.y, viewH / 2, h - viewH / 2);
}

init();
