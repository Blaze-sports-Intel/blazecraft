/**
 * Minimal state store with pub/sub.
 */
export type WorkerStatus = 'idle' | 'working' | 'moving' | 'blocked' | 'complete' | 'terminated' | 'hold';
export type Vec2 = { x: number; y: number };
export type Worker = {
  id: string;
  name: string;
  status: WorkerStatus;
  currentTask: string | null;
  targetRegion: string;
  position: Vec2;
  spawnedAt: number;
  tokensUsed: number;
  progress: number;
  errorMessage: string | null;
  updatedAt: number;
};
export type EventType = 'spawn' | 'task_start' | 'task_complete' | 'error' | 'terminate' | 'command' | 'status';
export type GameEvent = { timestamp: number; type: EventType; workerId: string; details: string };
export type GameEventInput = Omit<GameEvent, 'timestamp'> & { timestamp?: number };

export type GameStats = {
  completed: number;
  files: number;
  failed: number;
  tokens: number;
};

export interface StateStore {
  workers: Map<string, Worker>;
  events: GameEvent[];
  selected: Set<string>;
  startedAt: number;
  scout: string[];
  stats: GameStats;
  listeners: Set<(s: StateStore) => void>;
  bumpCompleted(n: number): void;
  bumpFiles(n: number): void;
  bumpFailed(n: number): void;
  pushScoutLine(line: string): void;
  subscribe(fn: (s: StateStore) => void): () => void;
  notify(): void;
  pushEvent(evt: GameEventInput): void;
  upsertWorker(worker: Worker): void;
  removeWorker(workerId: string): void;
  setSelected(ids: string[]): void;
  getSelectedWorkers(): Worker[];
  getIdleOrBlocked(): Worker[];
  tickStats(): void;
  getSessionDurationMs(): number;
}

export class GameState implements StateStore {
  constructor() {
    this.workers = new Map();
    this.events = [];
    this.selected = new Set();

    this.startedAt = Date.now();

    this.scout = [
      'No threats detected.',
      'Demo mode is generating worker activity.',
    ];

    this.stats = {
      completed: 0,
      files: 0,
      failed: 0,
      tokens: 0,
    };

    this.listeners = new Set();
  }

  workers: Map<string, Worker>;
  events: GameEvent[];
  selected: Set<string>;
  startedAt: number;
  scout: string[];
  stats: GameStats;
  listeners: Set<(s: StateStore) => void>;

  bumpCompleted(n: number) {
    this.stats.completed += n;
    this.notify();
  }

  bumpFiles(n: number) {
    this.stats.files += n;
    this.notify();
  }

  bumpFailed(n: number) {
    this.stats.failed += n;
    this.notify();
  }

  pushScoutLine(line: string) {
    // newest first
    this.scout = [line, ...this.scout].slice(0, 3);
    this.notify();
  }

  subscribe(fn: (s: StateStore) => void) {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this);
  }

  pushEvent(evt: GameEventInput) {
    const withTimestamp: GameEvent = {
      ...evt,
      timestamp: evt.timestamp ?? Date.now(),
    };
    this.events.unshift(withTimestamp);
    if (this.events.length > 250) this.events.length = 250;
    this.notify();
  }

  upsertWorker(worker: Worker) {
    this.workers.set(worker.id, worker);
    this.notify();
  }

  removeWorker(workerId: string) {
    this.workers.delete(workerId);
    this.selected.delete(workerId);
    this.notify();
  }

  setSelected(ids: string[]) {
    this.selected = new Set(ids);
    this.notify();
  }

  getSelectedWorkers() {
    const out = [];
    for (const id of this.selected) {
      const w = this.workers.get(id);
      if (w) out.push(w);
    }
    return out;
  }

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

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
