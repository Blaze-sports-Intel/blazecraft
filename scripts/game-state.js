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

    this.startedAt = Date.now();

    /** @type {string[]} */
    this.scout = [
      'No threats detected.',
      'Awaiting live agent activity.',
    ];

    this.stats = {
      completed: 0,
      files: 0,
      failed: 0,
      tokens: 0,
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
    this.events.unshift(evt);
    if (this.events.length > 250) this.events.length = 250;
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
    this.selected = new Set(ids);
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
