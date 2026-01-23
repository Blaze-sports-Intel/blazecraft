import { GameState } from './game-state.js';
import { Renderer } from './renderer.js';
import { UIPanels } from './ui-panels.js';
import { MockBridge } from './mock-data.js';
import { CommandCenter } from './commands.js';
import { clamp } from './map.js';
import { OpsBridge } from '../src/ops-bridge.js';
import { serviceState } from '../src/service-map.js';

/** @type {number} */
let opsEventCount = 0;
/** @type {number} */
let opsErrorCount = 0;

/**
 * Update WC3-style resource UI from metrics.
 * @param {{ gold: number, lumber: number, food: number, foodMax: number, upkeep: string }} resources
 */
function updateResourceUI(resources) {
  const goldEl = document.getElementById('resGold');
  const lumberEl = document.getElementById('resLumber');
  const foodEl = document.getElementById('resFood');
  const foodMaxEl = document.getElementById('resFoodMax');
  const upkeepEl = document.getElementById('resUpkeep');

  if (goldEl) goldEl.textContent = String(Math.round(resources.gold));
  if (lumberEl) lumberEl.textContent = String(Math.round(resources.lumber));
  if (foodEl) foodEl.textContent = String(resources.food);
  if (foodMaxEl) foodMaxEl.textContent = String(resources.foodMax);

  if (upkeepEl) {
    upkeepEl.textContent = resources.upkeep.charAt(0).toUpperCase() + resources.upkeep.slice(1);
    upkeepEl.className = 'wc3-res-num upkeep-' + resources.upkeep;
  }
}

/**
 * Update ops feed panel with new event.
 * @param {object} event
 */
function updateOpsFeed(event) {
  const feedEl = document.getElementById('opsFeed');
  const eventsEl = document.getElementById('opsEvents');
  const errorsEl = document.getElementById('opsErrors');

  if (!feedEl) return;

  opsEventCount++;
  if (eventsEl) eventsEl.textContent = String(opsEventCount);

  if (event.severity === 'error' || event.severity === 'critical') {
    opsErrorCount++;
    if (errorsEl) errorsEl.textContent = String(opsErrorCount);
  }

  // Add new line to feed (keep last 5)
  const line = document.createElement('div');
  line.className = 'wc3-ops-line' + (event.category === 'general' ? ' muted' : '');
  line.textContent = event.details || 'Event';
  feedEl.appendChild(line);

  // Keep only last 5 lines
  while (feedEl.children.length > 5) {
    feedEl.removeChild(feedEl.firstChild);
  }
}

/**
 * Clear ops feed and show initial demo message.
 */
function initOpsFeed() {
  const feedEl = document.getElementById('opsFeed');
  if (!feedEl) return;

  feedEl.innerHTML = '';
  const line = document.createElement('div');
  line.className = 'wc3-ops-line';
  line.textContent = 'Demo mode active. Monitoring BSI services.';
  feedEl.appendChild(line);
}

async function init() {
  const state = new GameState();

  const mapCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('mapCanvas'));
  const minimapCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('minimapCanvas'));

  const renderer = new Renderer(mapCanvas, minimapCanvas);
  await renderer.loadTextures();

  const bridge = new MockBridge(state);
  const commands = new CommandCenter(state, bridge);
  const ui = new UIPanels(state, renderer);

  // Wire up focus command to move camera
  commands.onFocus = (wx, wy) => {
    renderer.camera.x = wx;
    renderer.camera.y = wy;
    clampCamera(renderer, mapCanvas);
  };

  // Initialize OpsBridge for BSI service monitoring
  const opsBridge = new OpsBridge({
    demo: true,
    onEvent: (event) => {
      state.pushEvent(event);
      updateOpsFeed(event);
    },
    onMetrics: (metrics) => {
      updateResourceUI(metrics);
    },
    onConnection: (connected) => {
      const statusEl = document.getElementById('opsStatus');
      if (statusEl) {
        statusEl.textContent = connected ? 'Live' : 'Offline';
        statusEl.className = connected ? 'tag tag-live' : 'tag';
      }
    }
  });
  await opsBridge.connect();

  // Clear "Awaiting connection..." and show demo active message
  initOpsFeed();

  // Subscribe to service state changes for resource updates
  serviceState.subscribe(() => {
    updateResourceUI(serviceState.getResources());
  });

  // Initial resource update
  updateResourceUI(serviceState.getResources());

  // keep UI in sync
  state.subscribe(() => ui.render());

  // controls: log panel
  const toggleLog = document.getElementById('toggleLog');
  toggleLog.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('log-collapsed');
    toggleLog.setAttribute('aria-pressed', String(!collapsed));
  });

  // controls: demo mode
  let demoOn = true;
  const toggleDemo = document.getElementById('toggleDemo');
  toggleDemo.addEventListener('click', async () => {
    demoOn = !demoOn;
    toggleDemo.setAttribute('aria-pressed', String(demoOn));
    if (demoOn) {
      await bridge.connect();
      opsBridge.setDemoMode(true);
      state.pushScoutLine('Demo mode resumed. Workers rallying.');
    } else {
      bridge.disconnect();
      opsBridge.setDemoMode(false);
      state.setSelected([]);
      for (const wid of Array.from(state.workers.keys())) state.removeWorker(wid);
      state.events = [];
      state.pushScoutLine('Demo mode paused.');
      state.notify();
    }
  });

  // mode switching (RTS/Ops)
  const modeRTS = document.getElementById('modeRTS');
  const modeOps = document.getElementById('modeOps');

  function setMode(mode) {
    document.body.dataset.mode = mode;
    modeRTS?.classList.toggle('active', mode === 'rts');
    modeOps?.classList.toggle('active', mode === 'ops');
    state.pushScoutLine(mode === 'ops' ? 'Operations view active.' : 'RTS view active.');
  }

  modeRTS?.addEventListener('click', () => setMode('rts'));
  modeOps?.addEventListener('click', () => setMode('ops'));

  // start demo
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
  let pingMode = false;

  minimapCanvas.addEventListener('mousedown', (e) => {
    const wpt = renderer.minimapToWorld(e.clientX, e.clientY);
    if (pingMode) {
      renderer.addPing(wpt.x, wpt.y, 'spawn');
      state.pushScoutLine(`Ping at (${Math.round(wpt.x)}, ${Math.round(wpt.y)})`);
      return;
    }
    renderer.camera.x = wpt.x;
    renderer.camera.y = wpt.y;
    clampCamera(renderer, mapCanvas);
  });

  // minimap button handlers
  for (const btn of Array.from(document.querySelectorAll('.wc3-minimap-btn'))) {
    const action = btn.getAttribute('data-action');
    btn.addEventListener('click', () => {
      if (action === 'terrain') {
        renderer.showTerrain = !renderer.showTerrain;
        btn.classList.toggle('active', renderer.showTerrain);
        state.pushScoutLine(renderer.showTerrain ? 'Terrain visible.' : 'Terrain hidden.');
      }
      if (action === 'units') {
        renderer.showUnits = !renderer.showUnits;
        btn.classList.toggle('active', renderer.showUnits);
        state.pushScoutLine(renderer.showUnits ? 'Units visible.' : 'Units hidden.');
      }
      if (action === 'ping') {
        pingMode = !pingMode;
        btn.classList.toggle('active', pingMode);
        state.pushScoutLine(pingMode ? 'Ping mode: click minimap to ping.' : 'Ping mode off.');
      }
    });
  }

  // command card buttons (support both .cmd and .wc3-cmd)
  for (const b of Array.from(document.querySelectorAll('button[data-cmd]'))) {
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
    if (key === 'l') commands.exec('logs');
    if (key === 'f') commands.exec('files');
    if (key === 'n') commands.exec('notes');
    if (key === 'c') commands.exec('focus');
    if (key === 'g') commands.exec('guard');
    if (key === 'q') commands.exec('scan');
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
