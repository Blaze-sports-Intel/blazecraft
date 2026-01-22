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

    // Legacy resource elements (may not exist in WC3 layout)
    this.$resCompleted = el('resCompleted');
    this.$resFiles = el('resFiles');
    this.$resWorkers = el('resWorkers');
    this.$resFailed = el('resFailed');
    this.$resDuration = el('resDuration');
    this.$resTokens = el('resTokens');

    this.$idleAlert = el('idleAlert');
    this.$idleAlertCount = el('idleAlertCount');

    // Portrait elements (WC3 layout uses different IDs)
    this.$portraitIcon = el('portraitIcon');
    this.$portraitName = el('portraitName');
    this.$portraitTask = el('portraitTask');
    this.$portraitMeter = el('portraitMeter') || el('portraitHealth'); // WC3 uses portraitHealth
    this.$portraitStatus = el('portraitStatus');
    this.$portraitElapsed = el('portraitElapsed');
    this.$portraitTokens = el('portraitTokens');

    this.$logFeed = el('logFeed');
    this.$logStatus = el('logStatus');

    this.$scoutReport = el('scoutReport');

    this._idleIndex = 0;
    this._lastLogRenderKey = '';

    if (this.$idleAlert) {
      this.$idleAlert.addEventListener('click', () => this.cycleIdle());
    }
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

    // resources (only if elements exist - WC3 layout uses different resource system)
    if (this.$resCompleted) this.$resCompleted.textContent = String(s.stats.completed);
    if (this.$resFiles) this.$resFiles.textContent = String(s.stats.files);
    if (this.$resWorkers) this.$resWorkers.textContent = String(s.workers.size);
    if (this.$resFailed) this.$resFailed.textContent = String(s.stats.failed);
    if (this.$resTokens) this.$resTokens.textContent = String(s.stats.tokens);
    if (this.$resDuration) this.$resDuration.textContent = formatDuration(s.getSessionDurationMs());

    // idle alert
    const idleOrBlocked = s.getIdleOrBlocked();
    if (this.$idleAlert) {
      if (idleOrBlocked.length) {
        this.$idleAlert.hidden = false;
        if (this.$idleAlertCount) this.$idleAlertCount.textContent = String(idleOrBlocked.length);
        const hasBlocked = idleOrBlocked.some(w => w.status === 'blocked');
        this.$idleAlert.classList.toggle('has-blocked', hasBlocked);
      } else {
        this.$idleAlert.hidden = true;
      }
    }

    // portrait
    const selected = s.getSelectedWorkers();
    if (selected.length === 1) {
      const w = selected[0];
      if (this.$portraitIcon) this.$portraitIcon.textContent = w.name.slice(0, 1).toUpperCase();
      if (this.$portraitName) this.$portraitName.textContent = w.name;
      if (this.$portraitTask) this.$portraitTask.textContent = w.currentTask || 'No current task.';
      if (this.$portraitStatus) this.$portraitStatus.textContent = w.status;
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = formatDuration(Date.now() - w.spawnedAt);
      if (this.$portraitTokens) this.$portraitTokens.textContent = String(w.tokensUsed);
      const pct = (w.progress >= 0 && w.progress <= 100) ? w.progress : 0;
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = `${pct}%`;
        // WC3 layout uses wc3-health-fill class
        const isWc3 = this.$portraitMeter.classList.contains('wc3-health-fill');
        this.$portraitMeter.className = isWc3 ? 'wc3-health-fill' : `meter-fill status-${w.status}`;
      }
    } else if (selected.length > 1) {
      if (this.$portraitIcon) this.$portraitIcon.textContent = String(selected.length);
      if (this.$portraitName) this.$portraitName.textContent = `${selected.length} units selected`;
      if (this.$portraitTask) this.$portraitTask.textContent = 'Multiple tasks.';
      if (this.$portraitStatus) this.$portraitStatus.textContent = '-';
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = '-';
      if (this.$portraitTokens) this.$portraitTokens.textContent = '-';
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = '0%';
        const isWc3 = this.$portraitMeter.classList.contains('wc3-health-fill');
        this.$portraitMeter.className = isWc3 ? 'wc3-health-fill' : 'meter-fill';
      }
    } else {
      if (this.$portraitIcon) this.$portraitIcon.textContent = '?';
      if (this.$portraitName) this.$portraitName.textContent = 'No selection';
      if (this.$portraitTask) this.$portraitTask.textContent = 'Select a worker on the map.';
      if (this.$portraitStatus) this.$portraitStatus.textContent = 'Select a worker';
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = '-';
      if (this.$portraitTokens) this.$portraitTokens.textContent = '-';
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = '100%';
        const isWc3 = this.$portraitMeter.classList.contains('wc3-health-fill');
        this.$portraitMeter.className = isWc3 ? 'wc3-health-fill' : 'meter-fill';
      }
    }

    // scout report (may not exist in WC3 layout)
    if (this.$scoutReport) {
      this.$scoutReport.innerHTML = s.scout
        .map((line, idx) => `<div class="scout-line${idx === 0 ? '' : ' muted'}">${escapeHtml(line)}</div>`)
        .join('');
    }

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
