/**
 * WC3-style tooltip system initialization
 * Tooltips are already set up via inline script in index.html
 * This module provides programmatic control
 */

/**
 * Initialize the tooltip system and return control functions
 * @returns {{ show: (el: HTMLElement, data: object) => void, hide: () => void, update: (cmd: string, data: object) => void } | null}
 */
export function initTooltipSystem() {
  const tooltip = document.getElementById('wc3-tooltip');
  if (!tooltip) return null;

  const titleEl = tooltip.querySelector('.wc3-tooltip-title');
  const descEl = tooltip.querySelector('.wc3-tooltip-desc');
  const costEl = tooltip.querySelector('.wc3-tooltip-cost');

  return {
    /**
     * Show tooltip at element position
     * @param {HTMLElement} el
     * @param {{ title?: string, desc?: string, hotkey?: string, cost?: string }} data
     */
    show: (el, data) => {
      if (titleEl && data.title) {
        titleEl.innerHTML = data.hotkey
          ? `${data.title} <span class="wc3-tooltip-hotkey">${data.hotkey}</span>`
          : data.title;
      }
      if (descEl) descEl.textContent = data.desc || '';
      if (costEl) costEl.textContent = data.cost || '';

      tooltip.classList.add('visible');

      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    },

    hide: () => {
      tooltip.classList.remove('visible');
    },

    /**
     * Update tooltip data for a command
     * @param {string} cmd
     * @param {{ title?: string, desc?: string, hotkey?: string }} data
     */
    update: (cmd, data) => {
      // Update would be used if we need to change tooltip content dynamically
      // Currently tooltips are static in index.html
    },
  };
}
