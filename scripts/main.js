import { GameState } from './game-state.js';
import { Renderer } from './renderer.js';
import { UIPanels } from './ui-panels.js';
import { MockBridge } from './mock-data.js';
import { CommandCenter } from './commands.js';
import { clamp, randomPointIn, REGIONS, recordRegionActivity } from './map.js';
import { OpsBridge } from '../src/ops-bridge.js';
import { AgentBridge } from '../src/agent-bridge.js';
import { AlertSystem, ServiceAlerts } from './alerts.js';
import { initWispSystem } from './wc3-wisps.js';
import { initTooltipSystem } from './wc3-tooltips.js';

/** @type {number} */
let opsEventCount = 0;
/** @type {number} */
let opsErrorCount = 0;

/**
 * Update task metrics UI from GameState.
 * Targets: resCompleted, resFiles, resWorkers, resFailed, resTokens
 * @param {import('./game-state.js').GameState} state
 */
function updateMetricsUI(state) {
  const completedEl = document.getElementById('resCompleted');
  const filesEl = document.getElementById('resFiles');
  const workersEl = document.getElementById('resWorkers');
  const failedEl = document.getElementById('resFailed');
  const tokensEl = document.getElementById('resTokens');

  if (completedEl) completedEl.textContent = String(state.stats.completed);
  if (filesEl) filesEl.textContent = String(state.stats.files);
  if (workersEl) workersEl.textContent = String(state.workers.size);
  if (failedEl) failedEl.textContent = String(state.stats.failed).padStart(2, '0');
  if (tokensEl) tokensEl.textContent = String(state.stats.tokens);
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

  // Initialize alert system
  const appContainer = document.getElementById('app');
  const alertSystem = new AlertSystem({
    container: appContainer,
    renderer: renderer,
    enableSound: false, // Can be toggled by user preference
  });

  // Expose alert system for debugging/demo
  window.alerts = alertSystem;

  const bridge = new MockBridge(state);
  const commands = new CommandCenter(state, bridge);
  const ui = new UIPanels(state, renderer);

  // Wire up focus command to move camera
  commands.onFocus = (wx, wy) => {
    renderer.camera.x = wx;
    renderer.camera.y = wy;
    clampCamera(renderer, mapCanvas);
  };

  const params = new URLSearchParams(window.location.search);
  const opsBase = params.get('opsBase') || 'https://blazesportsintel.com/api/ops';
  const opsDemo = params.get('demo') === 'true';
  const agentsBase = params.get('agentsBase') || '/api/agents';

  // Initialize OpsBridge for BSI service monitoring
  const opsBridge = new OpsBridge({
    demo: opsDemo,
    endpoint: `${opsBase}/stream`,
    healthEndpoint: `${opsBase}/health-all`,
    metricsEndpoint: `${opsBase}/metrics`,
    onEvent: (event) => {
      state.pushEvent(event);
      updateOpsFeed(event);

      // Trigger alerts for critical events
      if (event.severity === 'critical') {
        const worker = state.workers.get(event.workerId);
        const location = worker ? { x: worker.position.x, y: worker.position.y } : null;
        alertSystem.critical(
          event.title || 'Critical Event',
          event.details || 'A critical issue has been detected.',
          { location }
        );
      } else if (event.severity === 'error') {
        const worker = state.workers.get(event.workerId);
        const location = worker ? { x: worker.position.x, y: worker.position.y } : null;
        ServiceAlerts.workerError(alertSystem, event.source || 'Unknown', event.details || 'Error occurred', location);
      }
    },
    onMetrics: (metrics) => {
      // Ops metrics (API stats) - update game stats from service activity
      // metrics contains: gold (API req/min), lumber (cache hit rate), food (connections), upkeep
      // Map meaningful metrics to game stats for demo visualization
      if (metrics && typeof metrics.gold === 'number') {
        // Simulate tasks completed based on API activity
        const apiActivity = Math.floor(metrics.gold / 10);
        if (apiActivity > state.stats.completed) {
          state.stats.completed = apiActivity;
        }
      }

      // Update metrics display
      updateMetricsUI(state);
      state.notify();

      // High error rate alert (upkeep = 'high' means trouble)
      if (metrics && metrics.upkeep === 'high') {
        const errorRate = 1 - ((metrics.lumber || 0) / 100);
        if (errorRate > 0.25) {
          ServiceAlerts.highErrorRate(alertSystem, errorRate);
        }
      }
    },
    onConnection: (connected) => {
      const statusEl = document.getElementById('opsStatus');
      if (statusEl) {
        statusEl.textContent = connected ? 'Live' : 'Offline';
        statusEl.className = connected ? 'tag tag-live' : 'tag';
      }

      // Connection status alerts
      if (!connected) {
        alertSystem.warning('Connection Lost', 'Attempting to reconnect to BSI services...');
      }
    }
  });
  await opsBridge.connect();

  const agentBridge = new AgentBridge({
    endpoint: `${agentsBase}/stream`,
    onEvent: (event) => {
      applyAgentEvent(state, event);
    },
    onConnection: (connected) => {
      state.pushScoutLine(connected ? 'Agent stream connected.' : 'Agent stream disconnected.');
    },
  });
  agentBridge.connect();

  // Initialize WC3 magical wisp particle system
  const wispSystem = initWispSystem();
  if (wispSystem) {
    // Expose for debugging
    window.wc3Wisps = wispSystem;
  }

  // Initialize WC3 tooltip system
  const tooltipSystem = initTooltipSystem();
  if (tooltipSystem) {
    window.wc3Tooltips = tooltipSystem;
  }

  // Welcome alert on demo start
  alertSystem.info(
    'BlazeCraft Initialized',
    opsDemo ? 'Demo mode active. Monitoring BSI services in real-time.' : 'Live mode active. Monitoring BSI services in real-time.',
    { duration: 4000 }
  );

  // Clear "Awaiting connection..." and show demo active message
  initOpsFeed();

  // Add initial event to the Event Log so it's not empty on start
  state.pushEvent({
    type: 'status',
    timestamp: Date.now(),
    workerId: '',
    details: 'BlazeCraft demo initialized. Workers spawning...',
  });

  // Keep UI and metrics in sync with state changes
  state.subscribe(() => {
    ui.render();
    updateMetricsUI(state);
  });

  // Initial UI render to show starting state
  ui.render();
  updateMetricsUI(state);

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
      const hit = hitTestWorker(state, wpt.x, wpt.y, renderer.camera.zoom);
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
function hitTestWorker(state, wx, wy, zoom = 1) {
  let best = null;
  let bestD = 999999;
  // Scale hit radius by inverse of zoom for consistent screen-space behavior
  // Base radius 32px screen-space → larger in world-space when zoomed out
  const hitRadius = 32 / zoom;
  for (const w of state.workers.values()) {
    const dx = w.position.x - wx;
    const dy = w.position.y - wy;
    const d = Math.hypot(dx, dy);
    if (d < hitRadius && d < bestD) {
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

// BSI Film Grain toggle (per CLAUDE.md design system)
window.BSIGrain = {
  disable: () => document.body.classList.add('bsi-grain-disabled'),
  enable: () => document.body.classList.remove('bsi-grain-disabled'),
  toggle: () => document.body.classList.toggle('bsi-grain-disabled'),
};

/**
 * @typedef {{type:string,agentId:string,agentName?:string,timestamp?:string,data?:{task?:string,tokens?:number,progress?:number,status?:string,error?:string,regionId?:string,filesModified?:number},source?:string}} AgentEvent
 */

/**
 * @param {GameState} state
 * @param {AgentEvent} event
 */
function applyAgentEvent(state, event) {
  if (!event || !event.agentId || !event.type) return;

  const now = Date.now();
  const existing = state.workers.get(event.agentId);
  const region = event.data?.regionId
    ? REGIONS.find((r) => r.id === event.data.regionId)
    : REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const position = existing?.position || (region ? randomPointIn(region) : { x: 600, y: 340 });

  const worker = existing || {
    id: event.agentId,
    name: event.agentName || event.agentId,
    status: 'idle',
    currentTask: null,
    targetRegion: region ? region.id : 'townhall',
    position,
    spawnedAt: now,
    tokensUsed: 0,
    progress: 0,
    errorMessage: null,
    updatedAt: now,
  };

  const task = event.data?.task || worker.currentTask;
  const progress = typeof event.data?.progress === 'number' ? event.data.progress : worker.progress;
  const tokens = typeof event.data?.tokens === 'number' ? event.data.tokens : worker.tokensUsed;

  switch (event.type) {
    case 'spawn':
      worker.status = 'idle';
      worker.currentTask = task;
      worker.progress = progress || 0;
      state.pushEvent({ type: 'spawn', workerId: worker.id, details: `${worker.name} connected.` });
      break;
    case 'task_start':
      worker.status = 'working';
      worker.currentTask = task || 'Task';
      worker.progress = progress || 5;
      state.pushEvent({ type: 'task_start', workerId: worker.id, details: `${worker.name}: ${worker.currentTask}` });
      break;
    case 'task_update':
      worker.status = 'working';
      worker.currentTask = task || worker.currentTask;
      worker.progress = progress;
      state.pushEvent({ type: 'status', workerId: worker.id, details: `${worker.name}: ${worker.currentTask || 'Update'}` });
      break;
    case 'task_complete':
      worker.status = 'complete';
      worker.progress = 100;
      worker.currentTask = task || worker.currentTask;
      state.bumpCompleted(1);
      if (event.data?.filesModified) {
        state.bumpFiles(event.data.filesModified);
      } else {
        state.bumpFiles(1);
      }
      if (region) {
        recordRegionActivity(region.id, 1);
      }
      state.pushEvent({ type: 'task_complete', workerId: worker.id, details: `${worker.name}: ${worker.currentTask || 'Task'} complete.` });
      break;
    case 'error':
      worker.status = 'blocked';
      worker.errorMessage = event.data?.error || 'Agent error';
      state.bumpFailed(1);
      state.pushEvent({ type: 'error', workerId: worker.id, details: `${worker.name}: ${worker.errorMessage}` });
      break;
    case 'terminate':
      worker.status = 'terminated';
      state.pushEvent({ type: 'terminate', workerId: worker.id, details: `${worker.name} terminated.` });
      state.upsertWorker({ ...worker, updatedAt: now });
      setTimeout(() => state.removeWorker(worker.id), 900);
      return;
    case 'status':
    default:
      worker.status = event.data?.status || worker.status;
      state.pushEvent({ type: 'status', workerId: worker.id, details: `${worker.name}: ${worker.status}` });
      break;
  }

  worker.tokensUsed = tokens || worker.tokensUsed;
  worker.updatedAt = now;
  state.upsertWorker({ ...worker });
  state.tickStats();
}
