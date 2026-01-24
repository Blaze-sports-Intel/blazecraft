/**
 * WC3-style wisp particle system initialization
 * Wisps are already created via inline script in index.html
 * This module provides programmatic control
 */

/**
 * Initialize the wisp system and return control functions
 * @returns {{ pause: () => void, resume: () => void, setCount: (n: number) => void } | null}
 */
export function initWispSystem() {
  const container = document.getElementById('wc3-wisps');
  if (!container) return null;

  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }

  return {
    pause: () => {
      container.style.animationPlayState = 'paused';
      for (const wisp of container.children) {
        /** @type {HTMLElement} */ (wisp).style.animationPlayState = 'paused';
      }
    },
    resume: () => {
      container.style.animationPlayState = 'running';
      for (const wisp of container.children) {
        /** @type {HTMLElement} */ (wisp).style.animationPlayState = 'running';
      }
    },
    setCount: (n) => {
      const current = container.children.length;
      if (n > current) {
        // Add wisps
        for (let i = 0; i < n - current; i++) {
          const wisp = document.createElement('div');
          wisp.className = 'wc3-wisp';
          wisp.style.cssText = `
            left: ${10 + Math.random() * 80}%;
            animation-delay: ${Math.random() * 8}s;
            animation-duration: ${6 + Math.random() * 6}s;
          `;
          container.appendChild(wisp);
        }
      } else if (n < current) {
        // Remove wisps
        while (container.children.length > n) {
          container.removeChild(container.lastChild);
        }
      }
    },
  };
}
