/**
 * BlazeCraft Alert System
 *
 * Alert types: warning, critical, info, success
 * Features:
 * - Banner notifications at top of screen
 * - Minimap ping integration
 * - Optional audio cues
 */

/** @typedef {'warning' | 'critical' | 'info' | 'success'} AlertType */

/**
 * @typedef {Object} Alert
 * @property {string} id
 * @property {AlertType} type
 * @property {string} title
 * @property {string} message
 * @property {number} timestamp
 * @property {number} duration - Auto-dismiss after ms (0 = manual dismiss)
 * @property {{x: number, y: number} | null} location - For minimap ping
 * @property {boolean} playSound
 */

const ALERT_STYLES = {
  warning: {
    bg: 'linear-gradient(135deg, rgba(212,160,23,0.95) 0%, rgba(180,130,20,0.95) 100%)',
    border: 'rgba(232,200,100,0.6)',
    icon: '⚠',
    sound: 'warning',
  },
  critical: {
    bg: 'linear-gradient(135deg, rgba(139,26,26,0.95) 0%, rgba(100,20,20,0.95) 100%)',
    border: 'rgba(200,80,80,0.6)',
    icon: '🔥',
    sound: 'critical',
  },
  info: {
    bg: 'linear-gradient(135deg, rgba(59,130,246,0.95) 0%, rgba(40,100,200,0.95) 100%)',
    border: 'rgba(100,160,255,0.6)',
    icon: 'ℹ',
    sound: 'info',
  },
  success: {
    bg: 'linear-gradient(135deg, rgba(74,156,45,0.95) 0%, rgba(50,120,30,0.95) 100%)',
    border: 'rgba(120,200,80,0.6)',
    icon: '✓',
    sound: 'success',
  },
};

export class AlertSystem {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Container for alert banners
   * @param {import('./renderer.js').Renderer} [options.renderer] - For minimap pings
   * @param {boolean} [options.enableSound] - Enable audio cues
   */
  constructor({ container, renderer = null, enableSound = false }) {
    this.container = container;
    this.renderer = renderer;
    this.enableSound = enableSound;

    /** @type {Map<string, Alert>} */
    this.activeAlerts = new Map();

    /** @type {HTMLDivElement} */
    this.bannerContainer = this.createBannerContainer();

    /** @type {Map<string, HTMLAudioElement>} */
    this.audioCache = new Map();

    this.nextId = 1;
  }

  createBannerContainer() {
    const existing = this.container.querySelector('.alert-banner-container');
    if (existing) return existing;

    const div = document.createElement('div');
    div.className = 'alert-banner-container';
    div.style.cssText = `
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      pointer-events: none;
      max-width: 600px;
      width: 100%;
    `;
    this.container.appendChild(div);
    return div;
  }

  /**
   * Show an alert
   * @param {AlertType} type
   * @param {string} title
   * @param {string} message
   * @param {Object} [options]
   * @param {number} [options.duration=5000] - Auto-dismiss after ms (0 = manual)
   * @param {{x: number, y: number}} [options.location] - For minimap ping
   * @param {boolean} [options.playSound=true]
   * @returns {string} Alert ID
   */
  show(type, title, message, options = {}) {
    const {
      duration = 5000,
      location = null,
      playSound = true,
    } = options;

    const id = `alert-${this.nextId++}`;

    /** @type {Alert} */
    const alert = {
      id,
      type,
      title,
      message,
      timestamp: Date.now(),
      duration,
      location,
      playSound,
    };

    this.activeAlerts.set(id, alert);
    this.renderBanner(alert);

    // Minimap ping
    if (location && this.renderer) {
      const pingKind = type === 'critical' || type === 'warning' ? 'error' : 'spawn';
      this.renderer.addPing(location.x, location.y, pingKind);
    }

    // Sound
    if (playSound && this.enableSound) {
      this.playAlertSound(type);
    }

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  /**
   * Dismiss an alert
   * @param {string} id
   */
  dismiss(id) {
    const alert = this.activeAlerts.get(id);
    if (!alert) return;

    const banner = this.bannerContainer.querySelector(`[data-alert-id="${id}"]`);
    if (banner) {
      banner.style.animation = 'alertSlideOut 0.3s ease-out forwards';
      setTimeout(() => banner.remove(), 300);
    }

    this.activeAlerts.delete(id);
  }

  /**
   * Dismiss all alerts
   */
  dismissAll() {
    for (const id of this.activeAlerts.keys()) {
      this.dismiss(id);
    }
  }

  /**
   * Render alert banner
   * @param {Alert} alert
   */
  renderBanner(alert) {
    const style = ALERT_STYLES[alert.type];

    const banner = document.createElement('div');
    banner.className = 'alert-banner';
    banner.dataset.alertId = alert.id;
    banner.style.cssText = `
      background: ${style.bg};
      border: 1px solid ${style.border};
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      pointer-events: auto;
      animation: alertSlideIn 0.3s ease-out forwards;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;

    // Icon
    const icon = document.createElement('span');
    icon.textContent = style.icon;
    icon.style.cssText = `
      font-size: 20px;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    `;

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; min-width: 0;';

    const titleEl = document.createElement('div');
    titleEl.textContent = alert.title;
    titleEl.style.cssText = `
      font-family: Cinzel, serif;
      font-size: 14px;
      font-weight: 700;
      color: rgba(255,255,255,0.95);
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      margin-bottom: 4px;
    `;

    const messageEl = document.createElement('div');
    messageEl.textContent = alert.message;
    messageEl.style.cssText = `
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13px;
      color: rgba(255,255,255,0.85);
      line-height: 1.4;
    `;

    content.appendChild(titleEl);
    content.appendChild(messageEl);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      background: rgba(0,0,0,0.2);
      border: none;
      border-radius: 4px;
      color: rgba(255,255,255,0.7);
      font-size: 18px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s ease;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(0,0,0,0.4)';
      closeBtn.style.color = 'rgba(255,255,255,0.95)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(0,0,0,0.2)';
      closeBtn.style.color = 'rgba(255,255,255,0.7)';
    });
    closeBtn.addEventListener('click', () => this.dismiss(alert.id));

    banner.appendChild(icon);
    banner.appendChild(content);
    banner.appendChild(closeBtn);

    this.bannerContainer.appendChild(banner);

    // Inject animation keyframes if not already present
    this.injectStyles();
  }

  /**
   * Play alert sound
   * @param {AlertType} type
   */
  playAlertSound(type) {
    // Web Audio API beep generation (no external files needed)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const frequencies = {
        warning: 440,
        critical: 880,
        info: 523,
        success: 659,
      };

      oscillator.frequency.value = frequencies[type] || 440;
      oscillator.type = type === 'critical' ? 'square' : 'sine';

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not supported or blocked
    }
  }

  injectStyles() {
    if (document.getElementById('alert-system-styles')) return;

    const style = document.createElement('style');
    style.id = 'alert-system-styles';
    style.textContent = `
      @keyframes alertSlideIn {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes alertSlideOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(-20px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Convenience methods

  /**
   * Show warning alert
   * @param {string} title
   * @param {string} message
   * @param {Object} [options]
   */
  warning(title, message, options = {}) {
    return this.show('warning', title, message, options);
  }

  /**
   * Show critical alert
   * @param {string} title
   * @param {string} message
   * @param {Object} [options]
   */
  critical(title, message, options = {}) {
    return this.show('critical', title, message, { ...options, duration: options.duration ?? 0 });
  }

  /**
   * Show info alert
   * @param {string} title
   * @param {string} message
   * @param {Object} [options]
   */
  info(title, message, options = {}) {
    return this.show('info', title, message, options);
  }

  /**
   * Show success alert
   * @param {string} title
   * @param {string} message
   * @param {Object} [options]
   */
  success(title, message, options = {}) {
    return this.show('success', title, message, options);
  }
}

/**
 * Service health alert triggers
 */
export const ServiceAlerts = {
  /**
   * @param {AlertSystem} alertSystem
   * @param {string} serviceName
   * @param {'healthy' | 'degraded' | 'down'} status
   * @param {{x: number, y: number}} [location]
   */
  serviceStatusChange(alertSystem, serviceName, status, location = null) {
    switch (status) {
      case 'degraded':
        alertSystem.warning(
          `${serviceName} Degraded`,
          'Service is experiencing issues. Monitoring...',
          { location, duration: 8000 }
        );
        break;
      case 'down':
        alertSystem.critical(
          `${serviceName} Down`,
          'Service is unresponsive. Check immediately.',
          { location, duration: 0 }
        );
        break;
      case 'healthy':
        alertSystem.success(
          `${serviceName} Recovered`,
          'Service is back online and healthy.',
          { location, duration: 5000 }
        );
        break;
    }
  },

  /**
   * @param {AlertSystem} alertSystem
   * @param {string} workerName
   * @param {string} error
   * @param {{x: number, y: number}} [location]
   */
  workerError(alertSystem, workerName, error, location = null) {
    alertSystem.warning(
      `Worker Error: ${workerName}`,
      error,
      { location, duration: 6000 }
    );
  },

  /**
   * @param {AlertSystem} alertSystem
   * @param {string} taskName
   * @param {{x: number, y: number}} [location]
   */
  taskComplete(alertSystem, taskName, location = null) {
    alertSystem.success(
      'Task Complete',
      taskName,
      { location, duration: 4000 }
    );
  },

  /**
   * @param {AlertSystem} alertSystem
   * @param {number} errorRate
   */
  highErrorRate(alertSystem, errorRate) {
    alertSystem.critical(
      'High Error Rate',
      `Error rate has reached ${(errorRate * 100).toFixed(1)}%. Investigation required.`,
      { duration: 0 }
    );
  },
};
