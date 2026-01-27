/**
 * @typedef {import('./game-state.js').GameState} GameState
 */

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
    const INVALID_SELECTION_MESSAGE = 'No worker selected. Select a worker first.';

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
      return;
    }

    // Other commands require selection
    if (!sel.length) {
      this.state.pushScoutLine(INVALID_SELECTION_MESSAGE);
      this.state.reportInvalidCommand(INVALID_SELECTION_MESSAGE);
      return;
    }

    if (cmd === 'reassign') {
      this.assignMode = true;
      this.state.pushEvent({ type: 'command', workerId: sel[0].id, details: `Assign mode: right-click a region.` });
      this.state.pushScoutLine('Assign mode: right-click a region to send selected workers.');
      return;
    }

    let actionApplied = false;

    for (const w of sel) {
      if (cmd === 'stop') {
        w.status = 'idle';
        w.progress = 0;
        w.currentTask = w.currentTask;
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Stopped.` });
        actionApplied = true;
      }

      if (cmd === 'hold') {
        if (w.status === 'working' || w.status === 'moving') {
          w.status = 'hold';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Held.` });
          actionApplied = true;
        }
      }

      if (cmd === 'resume') {
        if (w.status === 'hold' || w.status === 'idle') {
          w.status = 'working';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Resumed.` });
          actionApplied = true;
        }
      }

      if (cmd === 'inspect') {
        const detail = w.errorMessage
          ? `Inspect: ${w.errorMessage}`
          : `Inspect: ${w.currentTask || 'No task'}`;
        this.state.pushEvent({ type: 'command', workerId: w.id, details: detail });
        this.state.pushScoutLine(detail);
        actionApplied = true;
      }

      if (cmd === 'terminate') {
        w.status = 'terminated';
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.state.pushEvent({ type: 'terminate', workerId: w.id, details: `${w.name} terminated.` });
        setTimeout(() => this.state.removeWorker(w.id), 800);
        actionApplied = true;
      }

      if (cmd === 'logs') {
        const workerEvents = this.state.events.filter(e => e.workerId === w.id).slice(0, 10);
        const summary = workerEvents.length > 0
          ? workerEvents.map(e => e.details || e.type).join(' | ')
          : 'No recent events.';
        this.state.pushScoutLine(`[${w.name}] ${summary}`);
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Logs: ${workerEvents.length} recent events.` });
        actionApplied = true;
      }

      if (cmd === 'files') {
        const fileCount = Math.floor(w.tokensUsed / 100);
        this.state.pushScoutLine(`[${w.name}] Files touched: ~${fileCount}`);
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Files: ~${fileCount} touched.` });
        actionApplied = true;
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
        actionApplied = true;
      }

      if (cmd === 'focus') {
        if (this.onFocus) {
          this.onFocus(w.position.x, w.position.y);
        }
        this.state.pushEvent({ type: 'command', workerId: w.id, details: `Focused on ${w.name}.` });
        actionApplied = true;
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
        actionApplied = true;
      }
    }

    if (!actionApplied) {
      if (cmd === 'hold') {
        this.state.reportInvalidCommand('Hold requires a working or moving worker.');
      } else if (cmd === 'resume') {
        this.state.reportInvalidCommand('Resume requires an idle or held worker.');
      }
    }
  }

  /**
   * @param {import('./map.js').MapRegion} region
   */
  assignSelectedTo(region) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) {
      this.state.reportInvalidCommand('Select a worker before assigning.');
      return;
    }

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
  }
}
