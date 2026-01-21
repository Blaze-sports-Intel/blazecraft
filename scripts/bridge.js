// @ts-check

/**
 * Live bridge client for Cloudflare Worker data.
 * @typedef {import('./game-state.js').GameState} GameState
 * @typedef {import('./game-state.js').Worker} Worker
 * @typedef {import('./game-state.js').GameEvent} GameEvent
 */

/**
 * Aggregate statistics about bridge processing.
 *
 * @typedef BridgeStats
 * @property {number} completed Number of completed items (e.g. processed workers or tasks).
 * @property {number} files Number of files involved in processing.
 * @property {number} failed Number of items that failed processing.
 * @property {number} tokens Number of tokens consumed (for metering or billing).
 */

/**
 * Full state snapshot returned by the live bridge endpoint.
 * Used to initialize or completely replace the client's {@link GameState}.
 *
 * @typedef BridgeSnapshot
 * @property {Worker[]} workers Current set of workers keyed by their {@link Worker.id}.
 * @property {GameEvent[]} events Recent game events associated with the workers.
 * @property {string[]} scout Latest "scout" messages or diagnostics to display.
 * @property {BridgeStats} stats Aggregate statistics for the current snapshot.
 * @property {string} [cursor]
 *   Opaque position token returned by the bridge backend representing this snapshot.
 *   Pass this value back to the server on the next poll request to receive only
 *   changes that occurred after this snapshot (incremental polling). Consumers
 *   should treat this as an opaque string and must not attempt to inspect or
 *   modify it.
 * @property {string} [timestamp]
 *   ISO-8601 UTC timestamp indicating when the snapshot was generated on the
 *   server. This can be used by callers for freshness checks or to order
 *   multiple snapshots, but it is not required for correct cursor usage.
 */

/**
 * Incremental update (delta) returned by the live bridge endpoint.
 * Applies changes on top of an existing {@link GameState}.
 *
 * @typedef BridgeDelta
 * @property {Worker[]} [workers] Workers that were added or updated since the last poll.
 * @property {GameEvent[]} [events] Events that occurred since the last snapshot or delta.
 * @property {string[]} [scout] Updated "scout" messages or diagnostics.
 * @property {BridgeStats} [stats] Updated aggregate statistics to merge into the current stats.
 * @property {string} [cursor]
 *   Opaque position token representing the state after applying this delta.
 *   When present, pass this value back on the next poll to continue incremental
 *   updates from this point. As with snapshot cursors, callers must treat it as
 *   an opaque value.
 * @property {string} [timestamp]
 *   ISO-8601 UTC timestamp indicating when this delta was generated on the
 *   server. Callers may use this for freshness checks or ordering relative to
 *   other payloads.
 */
const DEFAULT_POLL_MS = 2000;

/**
 * @param {GameState} state
 * @param {BridgeSnapshot} snapshot
 */
function applySnapshot(state, snapshot) {
  // Update the existing workers Map in-place to preserve references.
  state.workers.clear();
  for (const worker of snapshot.workers) {
    state.workers.set(worker.id, worker);
  }

  if (Array.isArray(snapshot.events)) {
    state.events = snapshot.events.slice(-250).reverse();
  }

  if (Array.isArray(snapshot.scout)) {
    state.scout = snapshot.scout.slice(0, 3);
  }

  if (snapshot.stats) {
    state.stats = { ...state.stats, ...snapshot.stats };
  }

  if (state.selected.size) {
    const keep = new Set();
    /** @type {string[]} */
    const removed = [];
    for (const id of state.selected) {
      if (state.workers.has(id)) {
        keep.add(id);
      } else {
        removed.push(id);
      }
    }

    if (removed.length) {
      const message =
        removed.length === 1
          ? `Worker ${removed[0]} is no longer active; selection updated.`
          : `${removed.length} selected workers are no longer active; selection updated.`;

      if (!Array.isArray(state.scout)) {
        state.scout = [];
      }
      state.scout.unshift(message);
      if (state.scout.length > 3) {
        state.scout.length = 3;
      }
    }
    state.selected = keep;
  }

  state.notify();
}

/**
 * @param {GameState} state
 * @param {BridgeDelta} delta
 */
function applyDelta(state, delta) {
  if (Array.isArray(delta.workers)) {
    for (const worker of delta.workers) {
      state.workers.set(worker.id, worker);
    }
  }

  if (Array.isArray(delta.events)) {
    for (const evt of delta.events) state.events.unshift(evt);
    if (state.events.length > 250) state.events.length = 250;
  }

  if (Array.isArray(delta.scout)) {
    state.scout = delta.scout.slice(0, 3);
  }

  if (delta.stats) {
    state.stats = { ...state.stats, ...delta.stats };
  }

  state.notify();
}

/**
 * @param {unknown} payload
 * @returns {BridgeSnapshot | BridgeDelta | null}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {any} stats
 * @returns {stats is BridgeStats}
 */
function isValidBridgeStats(stats) {
  if (!isPlainObject(stats)) return false;
  return (
    typeof stats.completed === 'number' &&
    typeof stats.files === 'number' &&
    typeof stats.failed === 'number' &&
    typeof stats.tokens === 'number'
  );
}

/**
 * @param {any} workers
 * @returns {workers is Worker[]}
 */
function isValidWorkersArray(workers) {
  if (!Array.isArray(workers)) return false;
  for (const worker of workers) {
    if (!isPlainObject(worker)) return false;
    if (typeof worker.id !== 'string') return false;
  }
  return true;
}

/**
 * @param {unknown} payload
 * @returns {BridgeSnapshot | BridgeDelta | null}
 */
function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  /** @type {any} */
  const raw = /** @type {any} */ (payload).data ?? payload;
  if (!raw || typeof raw !== 'object') return null;

  /** @type {any} */
  const data = raw;

  const hasWorkers = 'workers' in data;
  const hasEvents = 'events' in data;
  const hasScout = 'scout' in data;
  const hasStats = 'stats' in data;

  // Try to interpret as a full snapshot if all required snapshot fields are present.
  if (hasWorkers && hasEvents && hasScout && hasStats) {
    if (
      !isValidWorkersArray(data.workers) ||
      !Array.isArray(data.events) ||
      !Array.isArray(data.scout) ||
      !isValidBridgeStats(data.stats)
    ) {
      return null;
    }

    /** @type {BridgeSnapshot} */
    const snapshot = {
      workers: data.workers,
      events: data.events,
      scout: data.scout,
      stats: data.stats,
      cursor: typeof data.cursor === 'string' ? data.cursor : undefined,
      timestamp: typeof data.timestamp === 'string' ? data.timestamp : undefined,
    };
    return snapshot;
  }

  // Otherwise, interpret as a delta with optional fields.
  /** @type {BridgeDelta} */
  const delta = {};

  if (hasWorkers && isValidWorkersArray(data.workers)) {
    delta.workers = data.workers;
  }

  if (hasEvents && Array.isArray(data.events)) {
    delta.events = data.events;
  }

  if (hasScout && Array.isArray(data.scout)) {
    delta.scout = data.scout;
  }

  if (hasStats && isValidBridgeStats(data.stats)) {
    delta.stats = data.stats;
  }

  if (typeof data.cursor === 'string') {
    delta.cursor = data.cursor;
  }

  if (typeof data.timestamp === 'string') {
    delta.timestamp = data.timestamp;
  }

  // If nothing valid was found, treat as malformed.
  if (
    delta.workers === undefined &&
    delta.events === undefined &&
    delta.scout === undefined &&
    delta.stats === undefined &&
    delta.cursor === undefined &&
    delta.timestamp === undefined
  ) {
    return null;
  }

  return delta;
}

/**
 * @param {string} message
 * @returns {Error}
 */
function toError(message) {
  return new Error(message);
}

export class LiveBridge {
  /**
   * @param {GameState} state
   * @param {{endpoint?: string, assignEndpoint?: string, pollIntervalMs?: number}=} options
   */
  constructor(state, options = {}) {
    this.state = state;
    const baseEndpoint = options.endpoint || new URL('/api/bridge', window.location.origin).toString();
    this.endpoint = baseEndpoint;
    this.assignEndpoint = options.assignEndpoint || new URL('./assign', this.endpoint).toString();
    this.pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_MS;
    this.running = false;
    this.cursor = null;
    this.poller = null;
    this.inflight = false;
    this.lastErrorAt = 0;
  }

  async connect() {
    if (this.running) return;
    this.running = true;
    try {
      await this.fetchSnapshot();
    } catch (error) {
      // If the initial snapshot fails, do not start polling.
      this.running = false;
      console.error('Failed to fetch initial bridge snapshot', error);
      return;
    }
    this.poller = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  disconnect() {
    this.running = false;
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  /**
   * @param {string[]} workerIds
   * @param {import('./map.js').MapRegion} region
   */
  async manualAssign(workerIds, region) {
    if (!this.running) return;
    try {
      const res = await fetch(this.assignEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerIds, regionId: region.id }),
      });

      if (!res.ok) throw toError(`Assign failed (${res.status})`);
      const payload = normalizePayload(await res.json());
      if (payload && this.running) applyDelta(this.state, payload);
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorAt > 8000) {
        this.lastErrorAt = now;
        this.state.pushScoutLine('Live bridge: assignment request failed.');
      }
      console.error(err);
    }
  }

  async poll() {
    if (!this.running || this.inflight) return;
    this.inflight = true;
    try {
      const url = new URL(this.endpoint);
      if (this.cursor) url.searchParams.set('cursor', this.cursor);
      const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw toError(`Bridge poll failed (${res.status})`);
      const payload = normalizePayload(await res.json());
      if (payload && this.running) {
        if (payload.cursor) this.cursor = payload.cursor;
        applyDelta(this.state, payload);
      }
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorAt > 8000) {
        this.lastErrorAt = now;
        this.state.pushScoutLine('Live bridge: connection interrupted. Retrying.');
      }
      console.error(err);
    } finally {
      this.inflight = false;
    }
  }

  async fetchSnapshot() {
    if (!this.running) return;
    try {
      const url = new URL(this.endpoint);
      url.searchParams.set('snapshot', '1');
      const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw toError(`Bridge snapshot failed (${res.status})`);
      const payload = normalizePayload(await res.json());
      if (!payload || !Array.isArray(payload.workers)) {
        throw toError('Bridge snapshot missing worker data');
      }
      if (payload.cursor !== undefined) this.cursor = payload.cursor;
      applySnapshot(this.state, /** @type {BridgeSnapshot} */ (payload));
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorAt > 8000) {
        this.lastErrorAt = now;
        this.state.pushScoutLine('Live bridge: initial connection failed. Retrying.');
      }
      console.error(err);
    }
  }
}
