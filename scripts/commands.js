/**
 * @typedef {import('./game-state.js').GameState} GameState
 */

const COMMAND_ACK_DURATION_MS = 900;
const COMMAND_INVALID_DURATION_MS = 600;

/** @param {import('./game-state.js').Worker} worker */
function getUnitTypeKey(worker) {
  const statusMap = {
    working: 'builder',
    moving: 'runner',
    idle: 'sentinel',
    blocked: 'blocked',
    hold: 'guardian',
    complete: 'veteran',
    terminated: 'fallen',
  };
  return statusMap[worker.status] || 'agent';
}

/** @param {import('./game-state.js').Worker[]} workers */
function getPrimaryType(workers) {
  const counts = new Map();
  for (const w of workers) {
    const key = getUnitTypeKey(w);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = 'agent';
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export class CommandCenter {
  /**
   * @param {GameState} state
   * @param {{manualAssign?: (workerIds: string[], region: any) => void}=} bridge
   */
  constructor(state, bridge) {
    this.state = state;
    this.bridge = bridge || {};
    this.assignMode = false;
    /** @type {Set<string>} Workers in guard mode (auto-reassign when idle) */
    this.guardedWorkers = new Set();
    /** @type {Map<string, string>} Worker annotations */
    this.workerNotes = new Map();
    /** @type {((wx: number, wy: number) => void)|null} */
    this.onFocus = null;
  }

  /**
   * @param {'stop'|'hold'|'resume'|'reassign'|'inspect'|'terminate'|'logs'|'files'|'notes'|'focus'|'guard'|'scan'} cmd
   */
  exec(cmd) {
    const sel = this.state.getSelectedWorkers();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Scan works on all workers, doesn't require selection
    if (cmd === 'scan') {
      let refreshed = 0;
      for (const w of this.state.workers.values()) {
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        refreshed++;
      }
      const msg = refreshed > 0
        ? `Scan complete. ${refreshed} worker${refreshed === 1 ? '' : 's'} refreshed.`
        : 'Scan complete. No active workers.';
      this.state.pushScoutLine(msg);
      this.state.pushEvent({ type: 'command', workerId: '', details: msg });
      this.state.setCommandFeedback({ type: 'ack', at: now, label: 'Scan complete' });
      setTimeout(() => this.state.setCommandFeedback(null), COMMAND_ACK_DURATION_MS);
      return;
    }

    // Other commands require selection
    if (!sel.length) {
      this.state.pushScoutLine('No worker selected. Select a worker first.');
      this.state.setCommandFeedback({ type: 'invalid', at: now, label: 'No selection' });
      setTimeout(() => this.state.setCommandFeedback(null), COMMAND_INVALID_DURATION_MS);
      return;
    }

    const primaryType = getPrimaryType(sel);
    let applied = false;

    if (cmd === 'reassign') {
      this.assignMode = true;
      this.state.pushEvent({ type: 'command', workerId: sel[0].id, details: `Assign mode: right-click a region.` });
      this.state.pushScoutLine('Assign mode: right-click a region to send selected workers.');
      this.state.setCommandFeedback({ type: 'ack', at: now, icon: primaryType, label: 'Assign mode' });
      setTimeout(() => this.state.setCommandFeedback(null), COMMAND_ACK_DURATION_MS);
      return;
    }

    for (const w of sel) {
      if (cmd === 'stop') {
        w.status = 'idle';
        w.progress = 0;
        w.currentTask = w.currentTask;
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Stopped.` });
        applied = true;
      }

      if (cmd === 'hold') {
        if (w.status === 'working' || w.status === 'moving') {
          w.status = 'hold';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Held.` });
          applied = true;
        }
      }

      if (cmd === 'resume') {
        if (w.status === 'hold' || w.status === 'idle') {
          w.status = 'working';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Resumed.` });
          applied = true;
        }
      }

      if (cmd === 'inspect') {
        const detail = w.errorMessage
          ? `Inspect: ${w.errorMessage}`
          : `Inspect: ${w.currentTask || 'No task'}`;
        this.state.pushEvent({ type: 'command', workerId: w.id, details: detail });
        this.state.pushScoutLine(detail);
        applied = true;
      }

      if (cmd === 'terminate') {
        w.status = 'terminated';
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.state.pushEvent({ type: 'terminate', workerId: w.id, details: `${w.name} terminated.` });
        setTimeout(() => this.state.removeWorker(w.id), 800);
        applied = true;
      }

      if (cmd === 'logs') {
        const workerEvents = this.state.events.filter(e => e.workerId === w.id).slice(0, 10);
        const summary = workerEvents.length > 0
          ? workerEvents.map(e => e.details || e.type).join(' | ')
          : 'No recent events.';
        this.state.pushScoutLine(`[${w.name}] ${summary}`);
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Logs: ${workerEvents.length} recent events.` });
        applied = true;
      }

      if (cmd === 'files') {
        const fileCount = Math.floor(w.tokensUsed / 100);
        this.state.pushScoutLine(`[${w.name}] Files touched: ~${fileCount}`);
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Files: ~${fileCount} touched.` });
        applied = true;
      }

      if (cmd === 'notes') {
        const existingNote = this.workerNotes.get(w.id);
        const note = existingNote ? `Note cleared.` : `Note: Priority worker.`;
        if (existingNote) {
          this.workerNotes.delete(w.id);
        } else {
          this.workerNotes.set(w.id, 'Priority worker');
        }
        this.state.pushScoutLine(`[${w.name}] ${note}`);
        this.state.pushEvent({ type: 'command', workerId: w.id, details: note });
        applied = true;
      }

      if (cmd === 'focus') {
        if (this.onFocus) {
          this.onFocus(w.position.x, w.position.y);
        }
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Focused on ${w.name}.` });
        applied = true;
      }

      if (cmd === 'guard') {
        const isGuarded = this.guardedWorkers.has(w.id);
        if (isGuarded) {
          this.guardedWorkers.delete(w.id);
          this.state.pushScoutLine(`[${w.name}] Guard mode off.`);
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Guard mode disabled.` });
        } else {
          this.guardedWorkers.add(w.id);
          this.state.pushScoutLine(`[${w.name}] Guard mode on. Auto-reassign when idle.`);
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Guard mode enabled.` });
        }
        applied = true;
      }
    }

    if (applied) {
      this.state.setCommandFeedback({ type: 'ack', at: now, icon: primaryType, label: 'Order received' });
      setTimeout(() => this.state.setCommandFeedback(null), COMMAND_ACK_DURATION_MS);
    } else {
      this.state.setCommandFeedback({ type: 'invalid', at: now, label: 'No effect' });
      setTimeout(() => this.state.setCommandFeedback(null), COMMAND_INVALID_DURATION_MS);
    }

  }

  /**
   * @param {import('./map.js').MapRegion} region
   */
  assignSelectedTo(region) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const ids = sel.map(w => w.id);
    if (this.bridge.manualAssign) {
      this.bridge.manualAssign(ids, region);
    } else {
      // fallback: just mark as moving (no pathing)
      for (const w of sel) {
        w.targetRegion = region.id;
        w.status = 'moving';
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
      }
      this.state.pushEvent({ type: 'command', workerId: sel[0].id, details: `Assigned to ${region.name}.` });
    }

    this.assignMode = false;
    const primaryType = getPrimaryType(sel);
    this.state.setCommandFeedback({ type: 'ack', at: now, icon: primaryType, label: 'Order received' });
    setTimeout(() => this.state.setCommandFeedback(null), COMMAND_ACK_DURATION_MS);
  }
}
