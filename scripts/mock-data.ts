import { REGIONS, randomPointIn, clamp, type MapRegion } from './map.js';
import type { GameState, Worker } from './game-state.js';

/**
 * Mock AgentBridge that simulates Claude subagents.
 */

const TASK_SNIPPETS: [string, ...string[]] = [
  'Refactor component boundary',
  'Fix failing unit tests',
  'Wire endpoint to UI',
  'Trim bundle and remove dead code',
  'Add keyboard shortcuts and focus states',
  'Investigate regression in renderer loop',
  'Hunt down a flaky integration test',
  'Tighten types and remove implicit any',
  'Polish textures and gold frames',
  'Extract state store and event bus',
];

function rnd<T>(arr: readonly T[]) {
  const pick = arr[Math.floor(Math.random() * arr.length)];
  if (pick === undefined) {
    throw new Error('Random pick failed because the collection was empty.');
  }
  return pick;
}

function id() {
  return Math.random().toString(16).slice(2, 10);
}

function now() { return Date.now(); }

function pickRegion() {
  // bias to goldmine + lumber
  const weighted: MapRegion[] = [];
  for (const r of REGIONS) {
    const w = r.type === 'goldmine' ? 5 : r.type === 'lumber' ? 3 : r.type === 'townhall' ? 2 : 1;
    for (let i = 0; i < w; i++) weighted.push(r);
  }
  if (!weighted.length) {
    const fallback = REGIONS[0];
    if (!fallback) {
      throw new Error('No regions configured for mock data.');
    }
    return fallback;
  }
  return rnd(weighted);
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

interface MotionState {
  vx: number;
  vy: number;
  goal: { x: number; y: number };
  speed: number;
}

export class MockBridge {
  state: GameState;
  running: boolean;
  timers: Array<ReturnType<typeof setInterval>>;
  motion: Map<string, MotionState>;

  constructor(state: GameState) {
    this.state = state;
    this.running = false;
    this.timers = [];

    this.motion = new Map();
  }

  /**
   * Manual assignment hook used by the command card (right-click a region).
   */
  manualAssign(workerIds: string[], region: MapRegion) {
    for (const wid of workerIds) {
      const w = this.state.workers.get(wid);
      if (!w) continue;

      w.targetRegion = region.id;
      w.status = 'moving';
      w.progress = 0;
      w.errorMessage = null;
      w.updatedAt = now();

      const goal = randomPointIn(region);
      this.motion.set(w.id, { vx: 0, vy: 0, goal, speed: 1.7 + Math.random() * 1.8 });

      this.state.upsertWorker({ ...w });
      this.state.pushEvent({ type: 'command', workerId: w.id, details: `Assigned to ${region.name}.` });
    }
  }

  async connect() {
    this.running = true;

    // initial trickle
    this.spawn();
    this.spawn();

    this.timers.push(setInterval(() => this.maybeSpawn(), 1600));
    this.timers.push(setInterval(() => this.step(), 50));
    this.timers.push(setInterval(() => this.heartbeat(), 1000));
  }

  disconnect() {
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  maybeSpawn() {
    if (!this.running) return;
    const max = 10;
    if (this.state.workers.size >= max) return;
    if (Math.random() < 0.35) this.spawn();
  }

  spawn() {
    const town = REGIONS.find((r) => r.id === 'townhall') || REGIONS[0];
    if (!town) {
      throw new Error('No regions configured for mock data.');
    }
    const start = randomPointIn(town);
    const target = pickRegion();

    const wid = `w-${id()}`;
    const w: Worker = {
      id: wid,
      name: `Subagent-${Math.floor(1 + Math.random() * 99)}`,
      status: 'moving',
      currentTask: rnd(TASK_SNIPPETS),
      targetRegion: target.id,
      position: { x: start.x, y: start.y },
      spawnedAt: now(),
      tokensUsed: Math.floor(200 + Math.random() * 800),
      progress: 0,
      errorMessage: null,
      updatedAt: now(),
    };

    this.state.upsertWorker(w);
    this.state.pushEvent({ type: 'spawn', workerId: w.id, details: `${w.name} rallied.` });

    // movement goal is a random point in target region
    const goal = randomPointIn(target);
    this.motion.set(w.id, { vx: 0, vy: 0, goal, speed: 1.6 + Math.random() * 1.6 });
  }

  step() {
    if (!this.running) return;

    for (const w of this.state.workers.values()) {
      if (w.status === 'terminated') continue;

      // move
      if (w.status === 'moving') {
        const m = this.motion.get(w.id);
        if (!m) continue;
        const dx = m.goal.x - w.position.x;
        const dy = m.goal.y - w.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = m.speed;
        w.position.x += (dx / d) * step;
        w.position.y += (dy / d) * step;
        w.updatedAt = now();

        if (d < 10) {
          // arrive
          w.position.x = m.goal.x;
          w.position.y = m.goal.y;
          this.motion.delete(w.id);
          w.status = Math.random() < 0.12 ? 'idle' : 'working';
          w.progress = w.status === 'working' ? Math.floor(5 + Math.random() * 14) : 0;
          w.updatedAt = now();

          if (w.status === 'working') {
            this.state.pushEvent({ type: 'task_start', workerId: w.id, details: `Started: ${w.currentTask}` });
          } else {
            this.state.pushEvent({ type: 'status', workerId: w.id, details: 'Awaiting orders.' });
          }
        }

        this.state.upsertWorker({ ...w });
        continue;
      }

      // hold
      if (w.status === 'hold') {
        // slight token burn
        w.tokensUsed += 1 + Math.floor(Math.random() * 3);
        w.updatedAt = now();
        this.state.upsertWorker({ ...w });
        continue;
      }

      // idle
      if (w.status === 'idle') {
        if (Math.random() < 0.03) {
          // reassign self
          const target = pickRegion();
          w.targetRegion = target.id;
          w.status = 'moving';
          w.currentTask = rnd(TASK_SNIPPETS);
          w.errorMessage = null;
          w.updatedAt = now();
          this.motion.set(w.id, { vx: 0, vy: 0, goal: randomPointIn(target), speed: 1.6 + Math.random() * 1.6 });
          this.state.pushEvent({ type: 'status', workerId: w.id, details: 'Re-tasked.' });
        }
        this.state.upsertWorker({ ...w });
        continue;
      }

      // blocked
      if (w.status === 'blocked') {
        // sometimes auto-recovers
        if (Math.random() < 0.02) {
          w.status = 'working';
          w.errorMessage = null;
          w.updatedAt = now();
          this.state.pushEvent({ type: 'status', workerId: w.id, details: 'Recovered; resumed.' });
        }
        this.state.upsertWorker({ ...w });
        continue;
      }

      // working
      if (w.status === 'working') {
        w.tokensUsed += 4 + Math.floor(Math.random() * 18);
        const bump = 0.6 + Math.random() * 2.4;
        w.progress = clamp(w.progress + bump, 0, 100);
        w.updatedAt = now();

        // files touched trickle
        if (Math.random() < 0.12) this.state.bumpFiles(1);

        // occasional failure
        if (Math.random() < 0.006) {
          w.status = 'blocked';
          w.errorMessage = 'Merge conflict in core module.';
          this.state.bumpFailed(1);
          this.state.pushEvent({ type: 'error', workerId: w.id, details: `Blocked: ${w.errorMessage}` });
          this.state.upsertWorker({ ...w });
          continue;
        }

        if (w.progress >= 100) {
          w.status = 'complete';
          w.updatedAt = now();
          this.state.bumpCompleted(1);
          this.state.pushEvent({ type: 'task_complete', workerId: w.id, details: `Completed: ${w.currentTask}` });

          // despawn soon
          setTimeout(() => {
            if (!this.running) return;
            const still = this.state.workers.get(w.id);
            if (!still) return;
            still.status = 'terminated';
            still.updatedAt = now();
            this.state.upsertWorker({ ...still });
            this.state.pushEvent({ type: 'terminate', workerId: still.id, details: `${still.name} dismissed.` });
            setTimeout(() => this.state.removeWorker(still.id), 900);
          }, 1400);
        }

        this.state.upsertWorker({ ...w });
        continue;
      }

      if (w.status === 'complete') {
        this.state.upsertWorker({ ...w });
      }
    }
  }

  heartbeat() {
    this.state.tickStats();

    // keep scout report fresh
    const idle = this.state.getIdleOrBlocked().filter((w) => w.status === 'idle').length;
    const blocked = this.state.getIdleOrBlocked().filter((w) => w.status === 'blocked').length;
    const active = this.state.workers.size;

    const msg = blocked
      ? `${formatInt(blocked)} worker${blocked === 1 ? '' : 's'} blocked. Conflicts or missing info.`
      : idle
        ? `${formatInt(idle)} worker${idle === 1 ? '' : 's'} idle. Assign tasks to keep momentum.`
        : `${formatInt(active)} worker${active === 1 ? '' : 's'} executing cleanly.`;

    this.state.pushScoutLine(msg);
  }
}
