import { formatDuration } from './game-state.js';

const ICONS = {
  spawn: '⚡',
  task_start: '⛏',
  task_complete: '✅',
  error: '❗',
  terminate: '✖',
  command: '⌘',
  status: '•',
};

function el(id) { return document.getElementById(id); }

export class UIPanels {
  /**
   * @param {import('./game-state.js').GameState} state
   * @param {import('./renderer.js').Renderer} renderer
   */
  constructor(state, renderer) {
    this.state = state;
    this.renderer = renderer;

    this.$resCompleted = el('resCompleted');
    this.$resFiles = el('resFiles');
    this.$resWorkers = el('resWorkers');
    this.$resFailed = el('resFailed');
    this.$resDuration = el('resDuration');
    this.$resTokens = el('resTokens');

    this.$idleAlert = el('idleAlert');
    this.$idleAlertCount = el('idleAlertCount');

    this.$portraitIcon = el('portraitIcon');
    this.$portraitName = el('portraitName');
    this.$portraitTask = el('portraitTask');
    this.$portraitMeter = el('portraitMeter');
    this.$portraitStatus = el('portraitStatus');
    this.$portraitElapsed = el('portraitElapsed');
    this.$portraitTokens = el('portraitTokens');

    this.$logFeed = el('logFeed');
    this.$logStatus = el('logStatus');

    this.$scoutReport = el('scoutReport');

    this._idleIndex = 0;
    this._lastLogRenderKey = '';

    this.$idleAlert.addEventListener('click', () => this.cycleIdle());
  }

  cycleIdle() {
    const list = this.state.getIdleOrBlocked();
    if (!list.length) return;
    this._idleIndex = (this._idleIndex + 1) % list.length;
    const w = list[this._idleIndex];
    this.state.setSelected([w.id]);
    this.renderer.camera.x = w.position.x;
    this.renderer.camera.y = w.position.y;
  }

  render() {
    const s = this.state;

    // resources
    this.$resCompleted.textContent = String(s.stats.completed);
    this.$resFiles.textContent = String(s.stats.files);
    this.$resWorkers.textContent = String(s.workers.size);
    this.$resFailed.textContent = String(s.stats.failed);
    this.$resTokens.textContent = String(s.stats.tokens);
    this.$resDuration.textContent = formatDuration(s.getSessionDurationMs());

    // idle alert
    const idleOrBlocked = s.getIdleOrBlocked();
    if (idleOrBlocked.length) {
      this.$idleAlert.hidden = false;
      this.$idleAlertCount.textContent = String(idleOrBlocked.length);
      const hasBlocked = idleOrBlocked.some(w => w.status === 'blocked');
      this.$idleAlert.classList.toggle('has-blocked', hasBlocked);
    } else {
      this.$idleAlert.hidden = true;
    }

    // portrait
    const selected = s.getSelectedWorkers();
    if (selected.length === 1) {
      const w = selected[0];
      this.$portraitIcon.textContent = w.name.slice(0, 1).toUpperCase();
      this.$portraitName.textContent = w.name;
      this.$portraitTask.textContent = w.currentTask || 'No current task.';
      this.$portraitStatus.textContent = w.status;
      this.$portraitElapsed.textContent = formatDuration(Date.now() - w.spawnedAt);
      this.$portraitTokens.textContent = String(w.tokensUsed);
      const pct = (w.progress >= 0 && w.progress <= 100) ? w.progress : 0;
      this.$portraitMeter.style.width = `${pct}%`;
      this.$portraitMeter.className = `meter-fill status-${w.status}`;
    } else if (selected.length > 1) {
      this.$portraitIcon.textContent = String(selected.length);
      this.$portraitName.textContent = `${selected.length} units selected`;
      this.$portraitTask.textContent = 'Multiple tasks.';
      this.$portraitStatus.textContent = '-';
      this.$portraitElapsed.textContent = '-';
      this.$portraitTokens.textContent = '-';
      this.$portraitMeter.style.width = '0%';
      this.$portraitMeter.className = 'meter-fill';
    } else {
      this.$portraitIcon.textContent = '?';
      this.$portraitName.textContent = 'No selection';
      this.$portraitTask.textContent = 'Select a worker on the map.';
      this.$portraitStatus.textContent = '-';
      this.$portraitElapsed.textContent = '-';
      this.$portraitTokens.textContent = '-';
      this.$portraitMeter.style.width = '0%';
      this.$portraitMeter.className = 'meter-fill';
    }

    // scout report
    this.$scoutReport.innerHTML = s.scout
      .map((line, idx) => `<div class="scout-line${idx === 0 ? '' : ' muted'}">${escapeHtml(line)}</div>`)
      .join('');

    // log
    const key = `${s.events.length}:${s.selected.size}:${s.workers.size}:${s.stats.completed}:${s.stats.failed}`;
    if (key !== this._lastLogRenderKey) {
      this._lastLogRenderKey = key;
      this.renderLog();
    }
  }

  renderLog() {
    const s = this.state;
    const max = 80;
    const items = s.events.slice(0, max);

    this.$logStatus.textContent = s.workers.size ? 'Live' : 'Idle';

    this.$logFeed.innerHTML = items.map(evt => {
      const icon = ICONS[evt.type] || '•';
      const t = new Date(evt.timestamp);
      const hh = String(t.getHours()).padStart(2,'0');
      const mm = String(t.getMinutes()).padStart(2,'0');
      const ss = String(t.getSeconds()).padStart(2,'0');
      const stamp = `${hh}:${mm}:${ss}`;
      const cls = evt.type === 'error' ? 'err' : evt.type === 'task_complete' ? 'ok' : evt.type === 'spawn' ? 'spawn' : '';

      return `<button class="log-item ${cls}" data-worker="${evt.workerId}">
        <span class="log-time">${stamp}</span>
        <span class="log-ico">${icon}</span>
        <span class="log-text">${escapeHtml(evt.details)}</span>
      </button>`;
    }).join('');

    // click handlers
    this.$logFeed.querySelectorAll('button.log-item').forEach((b) => {
      b.addEventListener('click', () => {
        const wid = b.getAttribute('data-worker');
        if (!wid) return;
        const w = s.workers.get(wid);
        if (!w) return;
        s.setSelected([wid]);
        this.renderer.camera.x = w.position.x;
        this.renderer.camera.y = w.position.y;
      });
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
