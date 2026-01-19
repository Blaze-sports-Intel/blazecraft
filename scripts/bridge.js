import { REGIONS } from './map.js';

/**
 * @typedef {import('./game-state.js').GameState} GameState
 * @typedef {import('./agent-bridge.js').AgentBridge} AgentBridge
 * @typedef {{x:number,y:number}} Vec2
 * @typedef {{id:string,name:string,status:'idle'|'working'|'moving'|'blocked'|'complete'|'terminated'|'hold',currentTask:string|null,targetRegion:string,position:Vec2,spawnedAt:number,tokensUsed:number,progress:number,errorMessage:string|null,updatedAt:number}} Worker
 * @typedef {{type:string,agentId?:string,workerId?:string,timestamp?:string|number,data?:Record<string, unknown>}} RawAgentEvent
 */

const DEFAULT_CONFIG = {
  wsUrl: 'wss://ticker.blazesportsintel.com/agents',
};

const CONNECTION_STATES = {
  idle: 'idle',
  connecting: 'connecting',
  connected: 'connected',
};

/**
 * @param {GameState} state
 * @param {{wsUrl?: string}=} config
 * @returns {AgentBridge}
 */
export function createBridge(state, config = {}) {
  return new ProductionBridge(state, { ...DEFAULT_CONFIG, ...config });
}

class ProductionBridge {
  /**
   * @param {GameState} state
   * @param {{wsUrl: string}} config
   */
  constructor(state, config) {
    this.state = state;
    this.config = config;
    this.ws = null;
    this.status = CONNECTION_STATES.idle;
    this.reconnectDelayMs = 1000;
    this.reconnectTimer = null;
  }

  async connect() {
    if (this.status === CONNECTION_STATES.connected || this.status === CONNECTION_STATES.connecting) return;
    this.status = CONNECTION_STATES.connecting;
    await this.openWebSocket();
  }

  disconnect() {
    this.status = CONNECTION_STATES.idle;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Manual assignment hook used by the command card (right-click a region).
   * @param {string[]} workerIds
   * @param {import('./map.js').MapRegion} region
   */
  manualAssign(workerIds, region) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.state.pushEvent({
        type: 'error',
        workerId: workerIds[0] || 'system',
        details: 'Assignment failed: bridge not connected.',
        timestamp: Date.now(),
      });
      return;
    }

    const payload = {
      type: 'manual_assign',
      workerIds,
      regionId: region.id,
      regionName: region.name,
      timestamp: new Date().toISOString(),
    };

    this.ws.send(JSON.stringify(payload));
    this.state.pushEvent({
      type: 'command',
      workerId: workerIds[0] || 'system',
      details: `Assigned ${workerIds.length} worker${workerIds.length === 1 ? '' : 's'} to ${region.name}.`,
      timestamp: Date.now(),
    });
  }

  async openWebSocket() {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.config.wsUrl);
      let settled = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      ws.addEventListener('open', () => {
        this.ws = ws;
        this.status = CONNECTION_STATES.connected;
        this.reconnectDelayMs = 1000;
        finish();
      });

      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      ws.addEventListener('error', () => {
        finish();
      });

      ws.addEventListener('close', () => {
        if (this.status !== CONNECTION_STATES.idle) {
          this.status = CONNECTION_STATES.idle;
          this.scheduleReconnect();
        }
        finish();
      });
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.status !== CONNECTION_STATES.idle) return;
      this.connect();
    }, this.reconnectDelayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000);
  }

  /**
   * @param {string|ArrayBuffer|Blob} payload
   */
  handleMessage(payload) {
    const text = typeof payload === 'string' ? payload : '';
    if (!text) return;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.state.pushEvent({
        type: 'error',
        workerId: 'system',
        details: 'Bridge received malformed JSON.',
        timestamp: Date.now(),
      });
      return;
    }

    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const raw of events) {
      this.applyAgentEvent(/** @type {RawAgentEvent} */ (raw));
    }
  }

  /**
   * @param {RawAgentEvent} evt
   */
  applyAgentEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    const workerId = String(evt.agentId || evt.workerId || '');
    if (!workerId) return;

    const timestamp = normalizeTimestamp(evt.timestamp);
    const data = /** @type {Record<string, any>} */ (evt.data || {});
    const type = String(evt.type || 'status');

    const existing = this.state.workers.get(workerId);
    const regionId = normalizeRegionId(data.region || data.regionId || existing?.targetRegion);
    const region = regionId ? REGIONS.find(r => r.id === regionId) : null;
    const position = normalizePosition(data.position, region);
    const name = data.name || existing?.name || workerId;
    const spawnedAt = existing?.spawnedAt || timestamp;

    /** @type {Worker} */
    const worker = {
      id: workerId,
      name,
      status: existing?.status || 'idle',
      currentTask: existing?.currentTask || null,
      targetRegion: regionId || existing?.targetRegion || 'townhall',
      position: position || existing?.position || { x: 0, y: 0 },
      spawnedAt,
      tokensUsed: coerceNumber(data.tokens ?? existing?.tokensUsed, 0),
      progress: coerceNumber(data.progress ?? existing?.progress, 0),
      errorMessage: existing?.errorMessage || null,
      updatedAt: timestamp,
    };

    switch (type) {
      case 'spawn':
        worker.status = 'idle';
        worker.currentTask = data.task || worker.currentTask || null;
        worker.position = position || worker.position;
        this.state.upsertWorker(worker);
        this.state.pushEvent({ type: 'spawn', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
      case 'task_start':
        worker.status = 'working';
        worker.currentTask = data.task || worker.currentTask;
        worker.progress = coerceNumber(data.progress ?? worker.progress, 0);
        this.state.upsertWorker(worker);
        this.state.pushEvent({ type: 'task_start', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
      case 'task_complete':
        worker.status = 'complete';
        worker.progress = 100;
        this.state.upsertWorker(worker);
        this.state.bumpCompleted(1);
        this.state.pushEvent({ type: 'task_complete', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
      case 'error':
        worker.status = 'blocked';
        worker.errorMessage = data.error || data.message || worker.errorMessage || 'Agent reported an error.';
        this.state.upsertWorker(worker);
        this.state.bumpFailed(1);
        this.state.pushEvent({ type: 'error', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
      case 'terminate':
        worker.status = 'terminated';
        this.state.upsertWorker(worker);
        this.state.pushEvent({ type: 'terminate', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
      case 'status':
      case 'command':
      default:
        if (data.status) worker.status = data.status;
        if (data.task) worker.currentTask = data.task;
        if (position) worker.position = position;
        this.state.upsertWorker(worker);
        this.state.pushEvent({ type: type === 'command' ? 'command' : 'status', workerId, details: buildDetailMessage(type, data, worker), timestamp });
        break;
    }
  }
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function coerceNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} timestamp
 * @returns {number}
 */
function normalizeTimestamp(timestamp) {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * @param {unknown} regionId
 * @returns {string|null}
 */
function normalizeRegionId(regionId) {
  if (!regionId) return null;
  const id = String(regionId);
  return REGIONS.some(r => r.id === id) ? id : null;
}

/**
 * @param {unknown} position
 * @param {import('./map.js').MapRegion|null} region
 * @returns {Vec2|null}
 */
function normalizePosition(position, region) {
  if (position && typeof position === 'object') {
    const x = /** @type {any} */ (position).x;
    const y = /** @type {any} */ (position).y;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x: Number(x), y: Number(y) };
    }
  }
  if (region) {
    return {
      x: region.bounds.x + region.bounds.width / 2,
      y: region.bounds.y + region.bounds.height / 2,
    };
  }
  return null;
}

/**
 * @param {string} type
 * @param {Record<string, any>} data
 * @param {Worker} worker
 */
function buildDetailMessage(type, data, worker) {
  if (data.detail && typeof data.detail === 'string') return data.detail;
  if (data.message && typeof data.message === 'string') return data.message;
  if (type === 'spawn') return `${worker.name} connected.`;
  if (type === 'task_start') return `Started: ${worker.currentTask || 'Task'}.`;
  if (type === 'task_complete') return `Completed: ${worker.currentTask || 'Task'}.`;
  if (type === 'error') return `Error: ${worker.errorMessage || 'Agent reported an error.'}`;
  if (type === 'terminate') return `${worker.name} disconnected.`;
  if (type === 'command') return `Command received for ${worker.name}.`;
  return `Status update for ${worker.name}.`;
}
