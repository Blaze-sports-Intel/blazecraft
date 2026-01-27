/**
 * Minimal state store with pub/sub.
 * @typedef {'idle'|'working'|'moving'|'blocked'|'complete'|'terminated'|'hold'} WorkerStatus
 * @typedef {{x:number,y:number}} Vec2
 * @typedef {{id:string,name:string,status:WorkerStatus,currentTask:string|null,targetRegion:string,position:Vec2,spawnedAt:number,tokensUsed:number,progress:number,errorMessage:string|null,updatedAt:number}} Worker
 * @typedef {'spawn'|'task_start'|'task_complete'|'error'|'terminate'|'command'|'status'} EventType
 * @typedef {{timestamp:number,type:EventType,workerId:string,details:string}} GameEvent
 */

export class GameState {
  constructor() {
    /** @type {Map<string, Worker>} */
    this.workers = new Map();
    /** @type {GameEvent[]} */
    this.events = [];
    /** @type {Set<string>} */
    this.selected = new Set();
    /** @type {number} */
    this.selectionRevision = 0;
    /** @type {number} */
    this.selectionChangedAt = 0;
    /** @type {{timestamp:number,workerId:string,details:string}|null} */
    this.lastCommandEvent = null;
    /** @type {number} */
    this.lastInvalidCommandAt = 0;
    /** @type {string} */
    this.lastInvalidCommandMessage = '';

    this.startedAt = Date.now();

    /** @type {string[]} */
    this.scout = [
      'No threats detected.',
      'Demo mode is generating worker activity.',
    ];

    // Seed with small values to show "prior session" activity
    // Prevents jarring all-zeros display on load
    this.stats = {
      completed: 3,
      files: 8,
      failed: 0,
      tokens: 412,
    };

    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  /** @param {number} n */
  bumpCompleted(n) {
    this.stats.completed += n;
    this.notify();
  }

  /** @param {number} n */
  bumpFiles(n) {
    this.stats.files += n;
    this.notify();
  }

  /** @param {number} n */
  bumpFailed(n) {
    this.stats.failed += n;
    this.notify();
  }

  /** @param {string} line */
  pushScoutLine(line) {
    // newest first
    this.scout = [line, ...this.scout].slice(0, 3);
    this.notify();
  }

  /** @param {(s:GameState)=>void} fn */
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this);
  }

  /** @param {GameEvent} evt */
  pushEvent(evt) {
    if (!evt.timestamp) {
      evt.timestamp = Date.now();
    }
    this.events.unshift(evt);
    if (this.events.length > 250) this.events.length = 250;
    if (evt.type === 'command' || evt.type === 'terminate') {
      this.lastCommandEvent = {
        timestamp: evt.timestamp,
        workerId: evt.workerId,
        details: evt.details,
      };
    }
    this.notify();
  }

  /** @param {Worker} worker */
  upsertWorker(worker) {
    this.workers.set(worker.id, worker);
    this.notify();
  }

  /** @param {string} workerId */
  removeWorker(workerId) {
    this.workers.delete(workerId);
    this.selected.delete(workerId);
    this.notify();
  }

  /** @param {string[]} ids */
  setSelected(ids) {
    const next = new Set(ids);
    if (setsEqual(this.selected, next)) return;
    this.selected = next;
    this.selectionRevision += 1;
    this.selectionChangedAt = Date.now();
    this.notify();
  }

  /** @param {string} message */
  reportInvalidCommand(message) {
    this.lastInvalidCommandAt = Date.now();
    this.lastInvalidCommandMessage = message;
    this.notify();
  }

  /** @returns {Worker[]} */
  getSelectedWorkers() {
    const out = [];
    for (const id of this.selected) {
      const w = this.workers.get(id);
      if (w) out.push(w);
    }
    return out;
  }

  /** @returns {Worker[]} */
  getIdleOrBlocked() {
    const out = [];
    for (const w of this.workers.values()) {
      if (w.status === 'idle' || w.status === 'blocked') out.push(w);
    }
    return out;
  }

  tickStats() {
    // aggregate tokens from worker objects
    let tokens = 0;
    for (const w of this.workers.values()) tokens += w.tokensUsed;
    this.stats.tokens = tokens;
  }

  getSessionDurationMs() {
    return Date.now() - this.startedAt;
  }
}

/** @param {number} ms */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 */
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}
