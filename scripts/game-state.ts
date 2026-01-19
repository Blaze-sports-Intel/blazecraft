export type WorkerStatus = 'idle' | 'working' | 'moving' | 'blocked' | 'complete' | 'terminated' | 'hold';

export type EventType = 'spawn' | 'task_start' | 'task_complete' | 'error' | 'terminate' | 'command' | 'status';

export interface EventPayloads {
  spawn: { workerId: string; details: string };
  task_start: { workerId: string; details: string };
  task_complete: { workerId: string; details: string };
  error: { workerId: string; details: string };
  terminate: { workerId: string; details: string };
  command: { workerId: string; details: string };
  status: { workerId: string; details: string };
}

export type GameEvent<T extends EventType = EventType> = {
  timestamp?: number;
  type: T;
} & EventPayloads[T];

export interface Vec2 {
  x: number;
  y: number;
}

export interface Worker {
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
}

export interface GameStats {
  completed: number;
  files: number;
  failed: number;
  tokens: number;
}

export class GameState {
  workers: Map<string, Worker>;
  events: GameEvent[];
  selected: Set<string>;
  startedAt: number;
  scout: string[];
  stats: GameStats;
  listeners: Set<(state: GameState) => void>;

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

  subscribe(fn: (state: GameState) => void) {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this);
  }

  pushEvent(evt: GameEvent) {
    this.events.unshift(evt);
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
    const out: Worker[] = [];
    for (const id of this.selected) {
      const w = this.workers.get(id);
      if (w) out.push(w);
    }
    return out;
  }

  getIdleOrBlocked() {
    const out: Worker[] = [];
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
