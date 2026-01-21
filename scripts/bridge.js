// @ts-check

/**
 * Live bridge client for Cloudflare Worker data.
 * @typedef {import('./game-state.js').GameState} GameState
 * @typedef {import('./game-state.js').Worker} Worker
 * @typedef {import('./game-state.js').GameEvent} GameEvent
 */

/** @typedef {{completed:number,files:number,failed:number,tokens:number}} BridgeStats */
/** @typedef {{workers:Worker[],events:GameEvent[],scout:string[],stats:BridgeStats,cursor?:string,timestamp?:string}} BridgeSnapshot */
/** @typedef {{workers?:Worker[],events?:GameEvent[],scout?:string[],stats?:BridgeStats,cursor?:string,timestamp?:string}} BridgeDelta */

const DEFAULT_POLL_MS = 2000;

/**
 * @param {GameState} state
 * @param {BridgeSnapshot} snapshot
 */
function applySnapshot(state, snapshot) {
  const workers = new Map(snapshot.workers.map((worker) => [worker.id, worker]));
  state.workers = workers;

  if (Array.isArray(snapshot.events)) {
    state.events = snapshot.events.slice(0, 250);
  }

  if (Array.isArray(snapshot.scout)) {
    state.scout = snapshot.scout.slice(0, 3);
  }

  if (snapshot.stats) {
    state.stats = { ...state.stats, ...snapshot.stats };
  }

  if (state.selected.size) {
    const keep = new Set();
    for (const id of state.selected) {
      if (state.workers.has(id)) keep.add(id);
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
function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const data = /** @type {any} */ (payload).data ?? payload;
  if (!data || typeof data !== 'object') return null;
  return /** @type {BridgeSnapshot | BridgeDelta} */ (data);
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
   * @param {{endpoint?: string, pollIntervalMs?: number}=} options
   */
  constructor(state, options = {}) {
    this.state = state;
    this.endpoint = options.endpoint || new URL('/api/bridge', window.location.origin).toString();
    this.assignEndpoint = new URL('/api/bridge/assign', window.location.origin).toString();
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
    await this.fetchSnapshot();
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
      if (payload) applyDelta(this.state, payload);
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
      if (payload.cursor) this.cursor = payload.cursor;
      applySnapshot(this.state, /** @type {BridgeSnapshot} */ (payload));
    } catch (err) {
      const now = Date.now();
      if (now - this.lastErrorAt > 8000) {
        this.lastErrorAt = now;
        this.state.pushScoutLine('Live bridge unavailable.');
      }
      console.error(err);
    }
  }
}
