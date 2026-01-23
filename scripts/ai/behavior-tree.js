/**
 * BlazeCraft Behavior Tree System
 *
 * Composable behavior tree for worker AI decision-making.
 * Replaces procedural if/else chains with declarative tree structure.
 */

/**
 * Behavior tree node statuses
 */
export const Status = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  RUNNING: 'running',
};

/**
 * Base behavior tree node
 */
export class BTNode {
  /**
   * @param {object} context - Shared context (worker, state, motion)
   * @returns {string} - Status.SUCCESS, Status.FAILURE, or Status.RUNNING
   */
  tick(context) {
    return Status.FAILURE;
  }
}

// =============================================================================
// Composite Nodes
// =============================================================================

/**
 * Selector: Returns SUCCESS on first child success, FAILURE if all fail
 */
export class Selector extends BTNode {
  constructor(children = []) {
    super();
    this.children = children;
  }

  tick(context) {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === Status.SUCCESS) return Status.SUCCESS;
      if (status === Status.RUNNING) return Status.RUNNING;
    }
    return Status.FAILURE;
  }
}

/**
 * Sequence: Returns FAILURE on first child failure, SUCCESS if all succeed
 */
export class Sequence extends BTNode {
  constructor(children = []) {
    super();
    this.children = children;
  }

  tick(context) {
    for (const child of this.children) {
      const status = child.tick(context);
      if (status === Status.FAILURE) return Status.FAILURE;
      if (status === Status.RUNNING) return Status.RUNNING;
    }
    return Status.SUCCESS;
  }
}

// =============================================================================
// Condition Nodes (Check worker status)
// =============================================================================

export class IsTerminated extends BTNode {
  tick(context) {
    return context.worker.status === 'terminated' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsBlocked extends BTNode {
  tick(context) {
    return context.worker.status === 'blocked' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsHold extends BTNode {
  tick(context) {
    return context.worker.status === 'hold' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsIdle extends BTNode {
  tick(context) {
    return context.worker.status === 'idle' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsMoving extends BTNode {
  tick(context) {
    return context.worker.status === 'moving' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsWorking extends BTNode {
  tick(context) {
    return context.worker.status === 'working' ? Status.SUCCESS : Status.FAILURE;
  }
}

export class IsComplete extends BTNode {
  tick(context) {
    return context.worker.status === 'complete' ? Status.SUCCESS : Status.FAILURE;
  }
}

// =============================================================================
// Action Nodes
// =============================================================================

/**
 * Skip processing for terminated workers
 */
export class SkipTerminated extends BTNode {
  tick(context) {
    // Just skip, don't update anything
    return Status.SUCCESS;
  }
}

/**
 * Handle blocked workers - chance to auto-recover
 */
export class HandleBlocked extends BTNode {
  constructor(recoveryChance = 0.02) {
    super();
    this.recoveryChance = recoveryChance;
  }

  tick(context) {
    const { worker, state } = context;

    if (Math.random() < this.recoveryChance) {
      worker.status = 'working';
      worker.errorMessage = null;
      worker.updatedAt = Date.now();
      state.pushEvent({ type: 'status', workerId: worker.id, details: 'Recovered; resumed.' });
    }

    state.upsertWorker({ ...worker });
    return Status.SUCCESS;
  }
}

/**
 * Handle hold status - light token drain
 */
export class HandleHold extends BTNode {
  tick(context) {
    const { worker, state } = context;

    worker.tokensUsed += 1 + Math.floor(Math.random() * 3);
    worker.updatedAt = Date.now();
    state.upsertWorker({ ...worker });

    return Status.SUCCESS;
  }
}

/**
 * Handle idle workers - chance to reassign
 */
export class HandleIdle extends BTNode {
  constructor(reassignChance = 0.03, pickRegionFn, taskSnippets) {
    super();
    this.reassignChance = reassignChance;
    this.pickRegionFn = pickRegionFn;
    this.taskSnippets = taskSnippets;
  }

  tick(context) {
    const { worker, state, motion, randomPointIn } = context;

    if (Math.random() < this.reassignChance) {
      const target = this.pickRegionFn(worker, state);
      worker.targetRegion = target.id;
      worker.status = 'moving';
      worker.currentTask = this.taskSnippets[Math.floor(Math.random() * this.taskSnippets.length)];
      worker.errorMessage = null;
      worker.updatedAt = Date.now();

      motion.set(worker.id, {
        vx: 0,
        vy: 0,
        goal: randomPointIn(target),
        speed: 1.6 + Math.random() * 1.6,
      });

      state.pushEvent({ type: 'status', workerId: worker.id, details: 'Re-tasked.' });
    }

    state.upsertWorker({ ...worker });
    return Status.SUCCESS;
  }
}

/**
 * Handle moving workers - steering toward goal
 */
export class HandleMoving extends BTNode {
  constructor(onArrive) {
    super();
    this.onArrive = onArrive;
  }

  tick(context) {
    const { worker, state, motion, steeringBehaviors } = context;

    const m = motion.get(worker.id);
    if (!m) return Status.FAILURE;

    // Use steering behaviors if available, otherwise simple seek
    let velocity;
    if (steeringBehaviors) {
      velocity = steeringBehaviors.arrive(worker.position, m.goal, m.speed);
    } else {
      const dx = m.goal.x - worker.position.x;
      const dy = m.goal.y - worker.position.y;
      const d = Math.hypot(dx, dy) || 1;
      velocity = { x: (dx / d) * m.speed, y: (dy / d) * m.speed };
    }

    worker.position.x += velocity.x;
    worker.position.y += velocity.y;
    worker.updatedAt = Date.now();

    const distToGoal = Math.hypot(m.goal.x - worker.position.x, m.goal.y - worker.position.y);

    if (distToGoal < 10) {
      worker.position.x = m.goal.x;
      worker.position.y = m.goal.y;
      motion.delete(worker.id);

      // Arrive callback
      if (this.onArrive) {
        this.onArrive(context);
      }
    }

    state.upsertWorker({ ...worker });
    return Status.SUCCESS;
  }
}

/**
 * Handle working workers - progress and potential completion/failure
 */
export class HandleWorking extends BTNode {
  constructor(onComplete, onBlocked) {
    super();
    this.onComplete = onComplete;
    this.onBlocked = onBlocked;
  }

  tick(context) {
    const { worker, state } = context;

    // Token consumption
    worker.tokensUsed += 4 + Math.floor(Math.random() * 18);

    // Progress
    const bump = 0.6 + Math.random() * 2.4;
    worker.progress = Math.min(100, Math.max(0, worker.progress + bump));
    worker.updatedAt = Date.now();

    // Files touched trickle
    if (Math.random() < 0.12) {
      state.bumpFiles(1);
    }

    // Occasional failure
    if (Math.random() < 0.006) {
      worker.status = 'blocked';
      worker.errorMessage = 'Merge conflict in core module.';
      state.bumpFailed(1);
      state.pushEvent({ type: 'error', workerId: worker.id, details: `Blocked: ${worker.errorMessage}` });

      if (this.onBlocked) this.onBlocked(context);
      state.upsertWorker({ ...worker });
      return Status.SUCCESS;
    }

    // Completion
    if (worker.progress >= 100) {
      worker.status = 'complete';
      worker.updatedAt = Date.now();
      state.bumpCompleted(1);
      state.pushEvent({ type: 'task_complete', workerId: worker.id, details: `Completed: ${worker.currentTask}` });

      if (this.onComplete) this.onComplete(context);
    }

    state.upsertWorker({ ...worker });
    return Status.SUCCESS;
  }
}

/**
 * Handle complete status - just persist
 */
export class HandleComplete extends BTNode {
  tick(context) {
    context.state.upsertWorker({ ...context.worker });
    return Status.SUCCESS;
  }
}

// =============================================================================
// Factory: Create default worker behavior tree
// =============================================================================

/**
 * Creates the default worker behavior tree
 * @param {object} config - Configuration options
 * @returns {BTNode} - Root behavior tree node
 */
export function createWorkerBehaviorTree(config = {}) {
  const {
    pickRegionFn,
    taskSnippets = [],
    onArrive,
    onComplete,
    onBlocked,
    recoveryChance = 0.02,
    reassignChance = 0.03,
  } = config;

  return new Selector([
    // Skip terminated workers
    new Sequence([new IsTerminated(), new SkipTerminated()]),

    // Handle blocked workers
    new Sequence([new IsBlocked(), new HandleBlocked(recoveryChance)]),

    // Handle hold status
    new Sequence([new IsHold(), new HandleHold()]),

    // Handle idle workers
    new Sequence([new IsIdle(), new HandleIdle(reassignChance, pickRegionFn, taskSnippets)]),

    // Handle moving workers
    new Sequence([new IsMoving(), new HandleMoving(onArrive)]),

    // Handle working workers
    new Sequence([new IsWorking(), new HandleWorking(onComplete, onBlocked)]),

    // Handle complete status
    new Sequence([new IsComplete(), new HandleComplete()]),
  ]);
}
