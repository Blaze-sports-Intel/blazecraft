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

// Worker avatar masks based on event type
const AVATARS = {
  spawn: { emoji: '🟢', class: 'log-avatar-spawn' },
  task_start: { emoji: '🟡', class: 'log-avatar-working' },
  task_complete: { emoji: '🟠', class: 'log-avatar-complete' },
  error: { emoji: '🔴', class: 'log-avatar-error' },
  terminate: { emoji: '⚪', class: 'log-avatar-default' },
  command: { emoji: '🔵', class: 'log-avatar-working' },
  status: { emoji: '🟤', class: 'log-avatar-default' },
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

    // Task metrics resource elements (new enhanced layout)
    this.$resCompleted = el('resCompleted');
    this.$resFiles = el('resFiles');
    this.$resWorkers = el('resWorkers');
    this.$resFailed = el('resFailed');
    this.$resDuration = el('resDuration');
    this.$resTokens = el('resTokens');

    // Enhanced idle alert
    this.$idleAlert = el('idleAlert');
    this.$idleAlertCount = el('idleAlertCount');

    // Enhanced portrait elements
    this.$portraitIcon = el('portraitIcon');
    this.$portraitAvatar = el('portraitAvatar');
    this.$portraitName = el('portraitName');
    this.$portraitTask = el('portraitTask');
    this.$portraitMeter = el('portraitMeter') || el('portraitHealth');
    this.$portraitProgress = el('portraitProgress');
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

    // portrait - enhanced display
    const selected = s.getSelectedWorkers();
    if (selected.length === 1) {
      const w = selected[0];
      // Worker avatar emoji based on status
      const statusEmojis = {
        working: '🤖',
        idle: '😴',
        blocked: '🚫',
        complete: '✅',
        terminated: '💀',
        hold: '⏸️',
        moving: '🚶',
      };
      if (this.$portraitIcon) this.$portraitIcon.textContent = statusEmojis[w.status] || '🤖';
      if (this.$portraitName) this.$portraitName.textContent = w.name;
      if (this.$portraitTask) this.$portraitTask.textContent = w.currentTask || 'No current task';
      if (this.$portraitStatus) this.$portraitStatus.textContent = w.status;
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = formatDuration(Date.now() - w.spawnedAt);
      if (this.$portraitTokens) this.$portraitTokens.textContent = String(w.tokensUsed);
      const pct = (w.progress >= 0 && w.progress <= 100) ? w.progress : 0;
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = `${pct}%`;
        // Apply status-based color to progress bar
        this.$portraitMeter.className = 'wc3-progress-fill';
        if (w.status === 'blocked') {
          this.$portraitMeter.style.background = 'linear-gradient(180deg, #e74c3c 0%, #c0392b 50%, #922b21 100%)';
        } else if (w.status === 'hold') {
          this.$portraitMeter.style.background = 'linear-gradient(180deg, #f39c12 0%, #d68910 50%, #b9770e 100%)';
        } else if (w.status === 'complete') {
          this.$portraitMeter.style.background = 'linear-gradient(180deg, #D4AF37 0%, #B8860B 50%, #8B6914 100%)';
        } else {
          this.$portraitMeter.style.background = '';
        }
      }
      if (this.$portraitProgress) this.$portraitProgress.textContent = `${Math.round(pct)}%`;
    } else if (selected.length > 1) {
      if (this.$portraitIcon) this.$portraitIcon.textContent = `${selected.length}`;
      if (this.$portraitName) this.$portraitName.textContent = `${selected.length} units selected`;
      if (this.$portraitTask) this.$portraitTask.textContent = 'Multiple tasks';
      if (this.$portraitStatus) this.$portraitStatus.textContent = '-';
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = '-';
      if (this.$portraitTokens) this.$portraitTokens.textContent = '-';
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = '0%';
        this.$portraitMeter.className = 'wc3-progress-fill';
        this.$portraitMeter.style.background = '';
      }
      if (this.$portraitProgress) this.$portraitProgress.textContent = '-';
    } else {
      if (this.$portraitIcon) this.$portraitIcon.textContent = '❓';
      if (this.$portraitName) this.$portraitName.textContent = 'No selection';
      if (this.$portraitTask) this.$portraitTask.textContent = 'Select a worker on the map';
      if (this.$portraitStatus) this.$portraitStatus.textContent = 'Select a worker';
      if (this.$portraitElapsed) this.$portraitElapsed.textContent = '-';
      if (this.$portraitTokens) this.$portraitTokens.textContent = '-';
      if (this.$portraitMeter) {
        this.$portraitMeter.style.width = '100%';
        this.$portraitMeter.className = 'wc3-progress-fill';
        this.$portraitMeter.style.background = 'linear-gradient(180deg, #607D8B 0%, #455A64 50%, #37474F 100%)';
      }
      if (this.$portraitProgress) this.$portraitProgress.textContent = '-';
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
      const t = new Date(evt.timestamp);
      const isValidDate = !isNaN(t.getTime());
      const hh = isValidDate ? String(t.getHours()).padStart(2,'0') : '00';
      const mm = isValidDate ? String(t.getMinutes()).padStart(2,'0') : '00';
      const ss = isValidDate ? String(t.getSeconds()).padStart(2,'0') : '00';
      const stamp = isValidDate ? `${hh}:${mm}:${ss}` : 'Now';
      const cls = evt.type === 'error' ? 'err' : evt.type === 'task_complete' ? 'ok' : evt.type === 'spawn' ? 'spawn' : '';

      // Get avatar info based on event type
      const avatar = AVATARS[evt.type] || AVATARS.status;
      const avatarClass = avatar.class;

      // Worker avatar masks - colorful face icons like in reference
      const avatarEmojis = {
        spawn: '🟢',
        task_start: '🟡',
        task_complete: '🟠',
        error: '🔴',
        terminate: '⚪',
        command: '🔵',
        status: '🟤',
      };
      const avatarEmoji = avatarEmojis[evt.type] || '🟤';

      // Format details text - remove "Error:" prefix for error type since CSS adds it
      let detailsText = escapeHtml(evt.details);
      if (evt.type === 'error') {
        detailsText = detailsText.replace(/^Error:\s*/i, '');
      }

      return `<button class="log-item ${cls}" data-worker="${evt.workerId}">
        <div class="log-avatar ${avatarClass}">${avatarEmoji}</div>
        <span class="log-time">${stamp}</span>
        <span class="log-text">${detailsText}</span>
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
