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
  }

  /**
   * @param {'stop'|'hold'|'resume'|'reassign'|'inspect'|'terminate'} cmd
   */
  exec(cmd) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) return;

    if (cmd === 'reassign') {
      this.assignMode = true;
      this.state.pushEvent({ type: 'command', workerId: sel[0].id, details: `Assign mode: right-click a region.` });
      this.state.pushScoutLine('Assign mode: right-click a region to send selected workers.');
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
      }

      if (cmd === 'hold') {
        if (w.status === 'working' || w.status === 'moving') {
          w.status = 'hold';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Held.` });
        }
      }

      if (cmd === 'resume') {
        if (w.status === 'hold' || w.status === 'idle') {
          w.status = 'working';
          w.updatedAt = Date.now();
          this.state.upsertWorker({ ...w });
          this.state.pushEvent({ type: 'command', workerId: w.id, details: `Resumed.` });
        }
      }

      if (cmd === 'inspect') {
        const detail = w.errorMessage
          ? `Inspect: ${w.errorMessage}`
          : `Inspect: ${w.currentTask || 'No task'}`;
        this.state.pushEvent({ type: 'command', workerId: w.id, details: detail });
        this.state.pushScoutLine(detail);
      }

      if (cmd === 'terminate') {
        w.status = 'terminated';
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.state.pushEvent({ type: 'terminate', workerId: w.id, details: `${w.name} terminated.` });
        setTimeout(() => this.state.removeWorker(w.id), 800);
      }
    }
  }

  /**
   * @param {import('./map.js').MapRegion} region
   */
  assignSelectedTo(region) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) return;

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
