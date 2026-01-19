import type { GameState, Worker, GameEvent } from './game-state.js';
import type { MapRegion } from './map.js';

export type CommandName = 'stop' | 'hold' | 'resume' | 'reassign' | 'inspect' | 'terminate';

export type ManualAssignHandler = (workerIds: string[], region: MapRegion) => void;

export type CommandBridge = {
  manualAssign?: ManualAssignHandler;
};

export class CommandCenter {
  state: GameState;
  bridge: CommandBridge;
  assignMode: boolean;

  constructor(state: GameState, bridge?: CommandBridge) {
    this.state = state;
    this.bridge = bridge ?? {};
    this.assignMode = false;
  }

  exec(cmd: CommandName) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) return;

    if (cmd === 'reassign') {
      this.assignMode = true;
      this.pushEvent({ type: 'command', workerId: sel[0].id, details: 'Assign mode: right-click a region.' });
      this.state.pushScoutLine('Assign mode: right-click a region to send selected workers.');
      return;
    }

    for (const w of sel) {
      if (cmd === 'stop') {
        this.stopWorker(w);
      }

      if (cmd === 'hold') {
        this.holdWorker(w);
      }

      if (cmd === 'resume') {
        this.resumeWorker(w);
      }

      if (cmd === 'inspect') {
        const detail = w.errorMessage
          ? `Inspect: ${w.errorMessage}`
          : `Inspect: ${w.currentTask || 'No task'}`;
        this.pushEvent({ type: 'command', workerId: w.id, details: detail });
        this.state.pushScoutLine(detail);
      }

      if (cmd === 'terminate') {
        w.status = 'terminated';
        w.updatedAt = Date.now();
        this.state.upsertWorker({ ...w });
        this.pushEvent({ type: 'terminate', workerId: w.id, details: `${w.name} terminated.` });
        setTimeout(() => this.state.removeWorker(w.id), 800);
      }
    }
  }

  assignSelectedTo(region: MapRegion) {
    const sel = this.state.getSelectedWorkers();
    if (!sel.length) return;

    const ids = sel.map((w) => w.id);
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
      this.pushEvent({ type: 'command', workerId: sel[0].id, details: `Assigned to ${region.name}.` });
    }

    this.assignMode = false;
  }

  private stopWorker(w: Worker) {
    w.status = 'idle';
    w.progress = 0;
    w.currentTask = w.currentTask;
    w.updatedAt = Date.now();
    this.state.upsertWorker({ ...w });
    this.pushEvent({ type: 'command', workerId: w.id, details: 'Stopped.' });
  }

  private holdWorker(w: Worker) {
    if (w.status === 'working' || w.status === 'moving') {
      w.status = 'hold';
      w.updatedAt = Date.now();
      this.state.upsertWorker({ ...w });
      this.pushEvent({ type: 'command', workerId: w.id, details: 'Held.' });
    }
  }

  private resumeWorker(w: Worker) {
    if (w.status === 'hold' || w.status === 'idle') {
      w.status = 'working';
      w.updatedAt = Date.now();
      this.state.upsertWorker({ ...w });
      this.pushEvent({ type: 'command', workerId: w.id, details: 'Resumed.' });
    }
  }

  private pushEvent(event: Omit<GameEvent, 'timestamp'>) {
    this.state.pushEvent({ ...event, timestamp: Date.now() });
  }
}
