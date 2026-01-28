/**
 * Onboarding Tour
 *
 * First-run tour that explains Demo vs Live mode and key UI components.
 * Uses localStorage to track completion.
 */

const ONBOARDING_KEY = 'blazecraft_onboarding_complete';

/**
 * Check if we're in a test environment
 * @returns {boolean}
 */
function isTestEnvironment() {
  if (typeof window === 'undefined') return false;
  // Check for Playwright, Puppeteer, or explicit test flag
  return !!(
    window.__TEST__ ||
    window.playwright ||
    navigator.webdriver ||
    window.__PLAYWRIGHT_BINDING__
  );
}

/**
 * Check if onboarding should be shown
 * @returns {boolean}
 */
export function shouldShowOnboarding() {
  if (typeof localStorage === 'undefined') return false;
  // Skip in test environments
  if (isTestEnvironment()) return false;
  return !localStorage.getItem(ONBOARDING_KEY);
}

/**
 * Mark onboarding as complete
 */
export function completeOnboarding() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

/**
 * Reset onboarding (for testing)
 */
export function resetOnboarding() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ONBOARDING_KEY);
}

/**
 * @typedef {Object} TourStep
 * @property {string} id - Step identifier
 * @property {string} title - Step title
 * @property {string} description - Step description
 * @property {string | null} highlightSelector - CSS selector for element to highlight
 * @property {'top' | 'bottom' | 'left' | 'right' | 'center'} position - Tooltip position
 */

/** @type {TourStep[]} */
const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to BlazeCraft',
    description: 'Your AI agent command center. Monitor and control Claude Code sessions in real-time with an RTS-style interface.',
    highlightSelector: null,
    position: 'center',
  },
  {
    id: 'demo-mode',
    title: 'Demo vs Live Mode',
    description: "You're in Demo mode with simulated workers. Click the Demo/Live button to switch to real BSI data when available.",
    highlightSelector: '#toggleDemo',
    position: 'bottom',
  },
  {
    id: 'health-status',
    title: 'Health Status',
    description: 'Monitor BSI service health in real-time. Green means online, yellow means degraded, red means offline.',
    highlightSelector: '#healthPanel',
    position: 'top',
  },
  {
    id: 'commands',
    title: 'Command Your Agents',
    description: 'Use command buttons or hotkeys (S, H, R, etc.) to control selected workers. Select workers by clicking on the map.',
    highlightSelector: '.wc3-command-panel-3x3',
    position: 'top',
  },
  {
    id: 'done',
    title: 'Ready to Go!',
    description: 'Explore the interface, select workers on the map, and monitor their progress. Have fun commanding your AI agents!',
    highlightSelector: null,
    position: 'center',
  },
];

/**
 * OnboardingTour class
 * Manages the step-by-step onboarding experience
 */
export class OnboardingTour {
  /** @type {number} */
  #currentStep = 0;

  /** @type {HTMLElement | null} */
  #overlay = null;

  /** @type {HTMLElement | null} */
  #spotlight = null;

  /** @type {HTMLElement | null} */
  #tooltip = null;

  /** @type {boolean} */
  #isActive = false;

  /** @type {() => void} */
  #onComplete = () => {};

  /**
   * Start the onboarding tour
   * @param {() => void} [onComplete] - Callback when tour completes
   */
  start(onComplete = () => {}) {
    if (this.#isActive) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Skip animations but still show tour
    }

    this.#isActive = true;
    this.#currentStep = 0;
    this.#onComplete = onComplete;

    this.#createOverlay();
    this.#showStep(0);
  }

  /**
   * Skip/close the tour
   */
  skip() {
    this.#cleanup();
    completeOnboarding();
    this.#onComplete();
  }

  /**
   * Go to next step
   */
  next() {
    if (this.#currentStep < TOUR_STEPS.length - 1) {
      this.#currentStep++;
      this.#showStep(this.#currentStep);
    } else {
      this.#finish();
    }
  }

  /**
   * Go to previous step
   */
  prev() {
    if (this.#currentStep > 0) {
      this.#currentStep--;
      this.#showStep(this.#currentStep);
    }
  }

  #createOverlay() {
    // Create overlay container
    this.#overlay = document.createElement('div');
    this.#overlay.className = 'tour-overlay';
    this.#overlay.setAttribute('role', 'dialog');
    this.#overlay.setAttribute('aria-modal', 'true');
    this.#overlay.setAttribute('aria-label', 'Onboarding Tour');

    // Create spotlight
    this.#spotlight = document.createElement('div');
    this.#spotlight.className = 'tour-spotlight';
    this.#overlay.appendChild(this.#spotlight);

    // Create tooltip
    this.#tooltip = document.createElement('div');
    this.#tooltip.className = 'tour-tooltip';
    this.#tooltip.innerHTML = `
      <button class="tour-close" type="button" aria-label="Skip tour">×</button>
      <div class="tour-content">
        <h3 class="tour-title"></h3>
        <p class="tour-desc"></p>
      </div>
      <div class="tour-nav">
        <button class="tour-btn tour-prev" type="button">Back</button>
        <span class="tour-progress"></span>
        <button class="tour-btn tour-next" type="button">Next</button>
      </div>
    `;
    this.#overlay.appendChild(this.#tooltip);

    // Wire up buttons
    this.#tooltip.querySelector('.tour-close')?.addEventListener('click', () => this.skip());
    this.#tooltip.querySelector('.tour-prev')?.addEventListener('click', () => this.prev());
    this.#tooltip.querySelector('.tour-next')?.addEventListener('click', () => this.next());

    // Keyboard navigation
    this.#overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.skip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') this.next();
      if (e.key === 'ArrowLeft') this.prev();
    });

    document.body.appendChild(this.#overlay);

    // Focus the tooltip for keyboard users
    this.#tooltip.setAttribute('tabindex', '-1');
    this.#tooltip.focus();
  }

  /**
   * @param {number} stepIndex
   */
  #showStep(stepIndex) {
    const step = TOUR_STEPS[stepIndex];
    if (!step || !this.#tooltip || !this.#spotlight) return;

    // Update content
    const titleEl = this.#tooltip.querySelector('.tour-title');
    const descEl = this.#tooltip.querySelector('.tour-desc');
    const progressEl = this.#tooltip.querySelector('.tour-progress');
    const prevBtn = /** @type {HTMLButtonElement} */ (this.#tooltip.querySelector('.tour-prev'));
    const nextBtn = /** @type {HTMLButtonElement} */ (this.#tooltip.querySelector('.tour-next'));

    if (titleEl) titleEl.textContent = step.title;
    if (descEl) descEl.textContent = step.description;
    if (progressEl) progressEl.textContent = `${stepIndex + 1} / ${TOUR_STEPS.length}`;

    // Update nav buttons
    if (prevBtn) {
      prevBtn.disabled = stepIndex === 0;
      prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    }
    if (nextBtn) {
      nextBtn.textContent = stepIndex === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next';
    }

    // Position spotlight and tooltip
    if (step.highlightSelector) {
      const target = document.querySelector(step.highlightSelector);
      if (target) {
        const rect = target.getBoundingClientRect();
        const padding = 8;

        this.#spotlight.style.display = 'block';
        this.#spotlight.style.left = `${rect.left - padding}px`;
        this.#spotlight.style.top = `${rect.top - padding}px`;
        this.#spotlight.style.width = `${rect.width + padding * 2}px`;
        this.#spotlight.style.height = `${rect.height + padding * 2}px`;

        // Position tooltip based on step.position
        this.#positionTooltip(rect, step.position);
      } else {
        this.#spotlight.style.display = 'none';
        this.#centerTooltip();
      }
    } else {
      this.#spotlight.style.display = 'none';
      this.#centerTooltip();
    }
  }

  /**
   * @param {DOMRect} targetRect
   * @param {TourStep['position']} position
   */
  #positionTooltip(targetRect, position) {
    if (!this.#tooltip) return;

    const tooltip = this.#tooltip;
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 16;

    let left = 0;
    let top = 0;

    switch (position) {
      case 'top':
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        top = targetRect.top - tooltipRect.height - margin;
        break;
      case 'bottom':
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        top = targetRect.bottom + margin;
        break;
      case 'left':
        left = targetRect.left - tooltipRect.width - margin;
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        left = targetRect.right + margin;
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        break;
      default:
        this.#centerTooltip();
        return;
    }

    // Keep tooltip in viewport
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = 'none';
  }

  #centerTooltip() {
    if (!this.#tooltip) return;
    this.#tooltip.style.left = '50%';
    this.#tooltip.style.top = '50%';
    this.#tooltip.style.transform = 'translate(-50%, -50%)';
  }

  #finish() {
    this.#cleanup();
    completeOnboarding();
    this.#onComplete();
  }

  #cleanup() {
    this.#isActive = false;
    if (this.#overlay) {
      this.#overlay.remove();
      this.#overlay = null;
    }
    this.#spotlight = null;
    this.#tooltip = null;
  }
}

export default OnboardingTour;
