import { REGIONS, randomPointIn, dist, clamp } from './map.js';
import { createWorkerBehaviorTree } from './ai/behavior-tree.js';
import { createUtilityPicker } from './ai/utility-ai.js';
import { createSteeringBehaviors, getNearbyPositions } from './ai/steering.js';

/**
 * Mock AgentBridge that simulates Claude subagents.
 * Uses behavior trees, utility AI, and steering behaviors for intelligent worker control.
 *
 * @typedef {import('./game-state.js').GameState} GameState
 */

const TASK_SNIPPETS = [
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

function rnd(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function id() {
  return Math.random().toString(16).slice(2, 10);
}

function now() {
  return Date.now();
}

/**
 * Legacy weighted random region picker (fallback)
 */
function pickRegionLegacy() {
  const weighted = [];
  for (const r of REGIONS) {
    const w = r.type === 'goldmine' ? 5 : r.type === 'lumber' ? 3 : r.type === 'townhall' ? 2 : 1;
    for (let i = 0; i < w; i++) weighted.push(r);
  }
  return rnd(weighted);
}

/** @param {number} n */
function formatInt(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * @param {GameState} state
 */
export class MockBridge {
  constructor(state) {
    this.state = state;
    this.running = false;
    this.timers = [];

    /** @type {Map<string, {vx:number,vy:number,goal:{x:number,y:number},speed:number}>} */
    this.motion = new Map();

    // Initialize AI systems
    this.steering = createSteeringBehaviors({
      maxSpeed: 3.0,
      maxForce: 0.3,
      arriveRadius: 40,
      separationRadius: 25,
    });

    // Utility-based region picker
    this.pickRegion = createUtilityPicker(REGIONS);

    // Behavior tree for worker updates
    this.behaviorTree = createWorkerBehaviorTree({
      pickRegionFn: (worker, gameState) => this.pickRegion(worker, gameState),
      taskSnippets: TASK_SNIPPETS,
      recoveryChance: 0.02,
      reassignChance: 0.03,
      onArrive: (context) => this.handleWorkerArrive(context),
      onComplete: (context) => this.handleWorkerComplete(context),
      onBlocked: (context) => this.handleWorkerBlocked(context),
    });
  }

  /**
   * Handle worker arriving at destination
   */
  handleWorkerArrive(context) {
    const { worker, state } = context;

    worker.status = Math.random() < 0.12 ? 'idle' : 'working';
    worker.progress = worker.status === 'working' ? Math.floor(5 + Math.random() * 14) : 0;
    worker.updatedAt = now();

    if (worker.status === 'working') {
      state.pushEvent({ type: 'task_start', workerId: worker.id, details: `Started: ${worker.currentTask}` });
    } else {
      state.pushEvent({ type: 'status', workerId: worker.id, details: 'Awaiting orders.' });
    }
  }

  /**
   * Handle worker completing a task
   */
  handleWorkerComplete(context) {
    const { worker } = context;

    // Bump stats for completed task
    this.state.bumpCompleted(1);
    this.state.bumpFiles(Math.floor(1 + Math.random() * 3));

    // Log task completion
    this.state.pushEvent({
      type: 'task_complete',
      workerId: worker.id,
      details: `${worker.name}: ${worker.currentTask || 'Task'} complete.`,
    });

    // Schedule despawn
    setTimeout(() => {
      if (!this.running) return;
      const still = this.state.workers.get(worker.id);
      if (!still) return;

      still.status = 'terminated';
      still.updatedAt = now();
      this.state.upsertWorker({ ...still });
      this.state.pushEvent({ type: 'terminate', workerId: still.id, details: `${still.name} dismissed.` });

      setTimeout(() => this.state.removeWorker(still.id), 900);
    }, 1400);
  }

  /**
   * Handle worker getting blocked
   */
  handleWorkerBlocked(context) {
    const { worker } = context;

    // Occasionally bump failed tasks when workers get blocked
    if (Math.random() < 0.3) {
      this.state.bumpFailed(1);
      this.state.pushEvent({
        type: 'error',
        workerId: worker.id,
        details: `${worker.name}: Task blocked - ${worker.errorMessage || 'conflict detected'}.`,
      });
    }
  }

  /**
   * Manual assignment hook used by the command card (right-click a region).
   * @param {string[]} workerIds
   * @param {import('./map.js').MapRegion} region
   */
  manualAssign(workerIds, region) {
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
    const start = randomPointIn(town);

    // Create a temporary worker for utility AI scoring
    const tempWorker = { position: start, type: 'default' };
    const target = this.pickRegion(tempWorker, this.state);

    const wid = `w-${id()}`;
    const w = {
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

  /**
   * Main simulation step - uses behavior tree for worker decisions
   */
  step() {
    if (!this.running) return;

    for (const w of this.state.workers.values()) {
      // Build context for behavior tree
      const context = {
        worker: w,
        state: this.state,
        motion: this.motion,
        steeringBehaviors: this.steering,
        randomPointIn,
      };

      // Special handling for moving workers with steering
      if (w.status === 'moving') {
        this.stepMoving(w);
        continue;
      }

      // Run behavior tree for other states
      this.behaviorTree.tick(context);
    }
  }

  /**
   * Handle moving workers with steering behaviors
   */
  stepMoving(w) {
    const m = this.motion.get(w.id);
    if (!m) return;

    // Get nearby worker positions for separation
    const neighbors = getNearbyPositions(w, this.state.workers, this.steering.separationRadius);

    // Calculate steering forces
    const arriveForce = this.steering.arrive(w.position, m.goal, m.speed);
    const separationForce = this.steering.separation(w.position, neighbors);

    // Combine behaviors (arrive dominant, some separation for natural movement)
    const combined = this.steering.combine([
      { behavior: arriveForce, weight: 0.9 },
      { behavior: separationForce, weight: 0.3 },
    ]);

    // Apply velocity
    w.position.x += combined.x;
    w.position.y += combined.y;
    w.updatedAt = now();

    const distToGoal = Math.hypot(m.goal.x - w.position.x, m.goal.y - w.position.y);

    if (distToGoal < 10) {
      // Arrive at goal
      w.position.x = m.goal.x;
      w.position.y = m.goal.y;
      this.motion.delete(w.id);

      // Transition to working or idle
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
  }

  heartbeat() {
    // Aggregate tokens from all workers
    this.state.tickStats();

    // Increment tokens over time (simulate ongoing work)
    for (const w of this.state.workers.values()) {
      if (w.status === 'working') {
        w.tokensUsed += Math.floor(10 + Math.random() * 30);
      }
    }

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
