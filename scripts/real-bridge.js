// @ts-check

/**
 * @typedef {import('./game-state.js').GameState} GameState
 * @typedef {import('./game-state.js').Worker} Worker
 * @typedef {import('./game-state.js').EventType} EventType
 * @typedef {import('./game-state.js').GameEvent} GameEvent
 */

const DEFAULT_STREAM_URL = 'https://blazecraft.app/api/agent-stream';
const DEFAULT_WS_URL = 'wss://blazecraft.app/api/agent-stream';
const DEFAULT_COMMAND_URL = 'https://blazecraft.app/api/agent-command';

const VALID_STATUSES = new Set(['idle', 'working', 'moving', 'blocked', 'complete', 'terminated', 'hold']);
const VALID_EVENT_TYPES = new Set(['spawn', 'task_start', 'task_complete', 'error', 'terminate', 'command', 'status']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function toNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function toString(value, fallback) {
  return typeof value === 'string' && value.trim().length ? value : fallback;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatChicagoTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const offsetRaw = (lookup.timeZoneName || 'GMT+0').replace('GMT', '').replace('UTC', '');
  const match = offsetRaw.match(/([+-]?)(\d{1,2})(?::(\d{2}))?/);
  const sign = match && match[1] ? match[1] : '+';
  const hours = match ? String(match[2]).padStart(2, '0') : '00';
  const minutes = match && match[3] ? match[3] : '00';
  const offsetClean = `${sign}${hours}:${minutes}`;
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}${offsetClean}`;
}

/**
 * @param {unknown} payload
 * @param {number} fallbackTimestamp
 * @returns {Worker | null}
 */
export function normalizeWorkerPayload(payload, fallbackTimestamp) {
  if (!isRecord(payload)) return null;
  const id = toString(payload.id ?? payload.workerId, '');
  if (!id) return null;
  const name = toString(payload.name, id);
  const statusRaw = toString(payload.status, 'idle');
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : 'idle';

  const positionPayload = isRecord(payload.position) ? payload.position : payload;
  const x = toNumber(positionPayload.x, Number.NaN);
  const y = toNumber(positionPayload.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const spawnedAt = parseTimestamp(payload.spawnedAt ?? payload.spawned_at ?? fallbackTimestamp);
  const updatedAt = parseTimestamp(payload.updatedAt ?? payload.updated_at ?? fallbackTimestamp);

  return {
    id,
    name,
    status,
    currentTask: typeof payload.currentTask === 'string' ? payload.currentTask : (typeof payload.task === 'string' ? payload.task : null),
    targetRegion: toString(payload.targetRegion ?? payload.region, 'ground'),
    position: { x, y },
    spawnedAt,
    tokensUsed: toNumber(payload.tokensUsed ?? payload.tokens, 0),
    progress: toNumber(payload.progress, 0),
    errorMessage: typeof payload.errorMessage === 'string' ? payload.errorMessage : (typeof payload.error === 'string' ? payload.error : null),
    updatedAt,
  };
}

/**
 * @param {unknown} payload
 * @param {number} timestamp
 * @returns {GameEvent | null}
 */
function normalizeGameEvent(payload, timestamp) {
  if (!isRecord(payload)) return null;
  const rawType = toString(payload.eventType ?? payload.type, '');
  if (!VALID_EVENT_TYPES.has(rawType)) return null;
  const workerId = toString(payload.workerId ?? payload.agentId ?? payload.id, '');
  if (!workerId) return null;
  const details = toString(payload.details ?? payload.message, '');
  if (!details) return null;
  return { type: /** @type {EventType} */ (rawType), workerId, details, timestamp };
}

/**
 * @param {GameState} state
 * @param {unknown} payload
 */
function applyStatsPayload(state, payload) {
  if (!isRecord(payload)) return;
  if (Number.isFinite(Number(payload.completed))) state.stats.completed = Number(payload.completed);
  if (Number.isFinite(Number(payload.files))) state.stats.files = Number(payload.files);
  if (Number.isFinite(Number(payload.failed))) state.stats.failed = Number(payload.failed);
  if (Number.isFinite(Number(payload.tokens))) state.stats.tokens = Number(payload.tokens);
  state.notify();
}

export class RealBridge {
  /**
   * @param {GameState} state
   * @param {{streamUrl?: string, wsUrl?: string, commandUrl?: string, transport?: 'sse'|'ws'}=} options
   */
  constructor(state, options = {}) {
    this.state = state;
    this.streamUrl = options.streamUrl || DEFAULT_STREAM_URL;
    this.wsUrl = options.wsUrl || DEFAULT_WS_URL;
    this.commandUrl = options.commandUrl || DEFAULT_COMMAND_URL;
    this.transport = options.transport || 'sse';
    this.running = false;
    this.reconnectTimer = null;
    this.retryCount = 0;
    this.source = null;
    this.socket = null;
  }

  async connect() {
    if (this.running) return;
    this.running = true;
    this.retryCount = 0;
    this.openStream();
  }

  disconnect() {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * @param {string[]} workerIds
   * @param {import('./map.js').MapRegion} region
   */
  async manualAssign(workerIds, region) {
    const payload = {
      type: 'command.assign',
      timestamp: formatChicagoTimestamp(),
      timestampMs: Date.now(),
      data: {
        workerIds,
        regionId: region.id,
        regionName: region.name,
      },
    };

    try {
      const res = await fetch(this.commandUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = `Command failed (${res.status}).`;
        this.state.pushEvent({ type: 'error', workerId: workerIds[0] || 'unknown', details: msg, timestamp: Date.now() });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command failed.';
      this.state.pushEvent({ type: 'error', workerId: workerIds[0] || 'unknown', details: msg, timestamp: Date.now() });
    }
  }

  openStream() {
    if (!this.running) return;
    if (this.transport === 'ws') {
      this.openWebSocket();
    } else {
      this.openEventSource();
    }
  }

  openEventSource() {
    if (!this.running) return;
    this.source = new EventSource(this.streamUrl);
    this.source.onopen = () => {
      this.retryCount = 0;
      this.state.pushScoutLine('Connected to live event stream.');
    };
    this.source.onmessage = (evt) => this.handleMessage(evt.data);
    this.source.onerror = () => {
      this.state.pushScoutLine('Live stream disconnected. Reconnecting...');
      this.scheduleReconnect();
    };
  }

  openWebSocket() {
    if (!this.running) return;
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener('open', () => {
      this.retryCount = 0;
      this.state.pushScoutLine('Connected to live WebSocket feed.');
    });
    this.socket.addEventListener('message', (evt) => this.handleMessage(evt.data));
    this.socket.addEventListener('close', () => {
      this.state.pushScoutLine('WebSocket closed. Reconnecting...');
      this.scheduleReconnect();
    });
    this.socket.addEventListener('error', () => {
      this.state.pushScoutLine('WebSocket error. Reconnecting...');
      this.scheduleReconnect();
    });
  }

  /**
   * @param {string} raw
   */
  handleMessage(raw) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      this.state.pushEvent({ type: 'error', workerId: 'stream', details: 'Malformed stream event.', timestamp: Date.now() });
      return;
    }

    if (!isRecord(payload)) return;
    const kind = toString(payload.type ?? payload.kind, '');
    const timestamp = parseTimestamp(payload.timestamp ?? payload.timestampMs ?? payload.time);

    if (kind === 'worker.upsert' || kind === 'worker.snapshot') {
      const workerPayload = payload.worker ?? payload.data?.worker ?? payload.data ?? payload;
      const worker = normalizeWorkerPayload(workerPayload, timestamp);
      if (worker) this.state.upsertWorker(worker);
      return;
    }

    if (kind === 'worker.remove') {
      const id = toString(payload.workerId ?? payload.data?.workerId ?? payload.data?.id ?? payload.id, '');
      if (id) this.state.removeWorker(id);
      return;
    }

    if (kind === 'event') {
      const eventPayload = payload.event ?? payload.data?.event ?? payload.data ?? payload;
      const evt = normalizeGameEvent(eventPayload, timestamp);
      if (evt) this.state.pushEvent(evt);
      return;
    }

    if (kind === 'stats') {
      applyStatsPayload(this.state, payload.data ?? payload);
      return;
    }

    if (kind === 'scout') {
      const line = toString(payload.data?.line ?? payload.line, '');
      if (line) this.state.pushScoutLine(line);
    }
  }

  scheduleReconnect() {
    if (!this.running) return;
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    const wait = Math.min(20000, 1000 * Math.pow(2, this.retryCount));
    this.retryCount += 1;
    this.reconnectTimer = setTimeout(() => this.openStream(), wait);
  }
}
