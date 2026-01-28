/**
 * BlazeCraft React Entry Point
 *
 * Mounts the React app alongside the existing vanilla JS application.
 * This enables progressive enhancement with React components.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import BlazeCraftApp from './App.jsx';

// Store reference to the React root for hot reloading
let root = null;

/**
 * Initialize React components
 * @param {Object} gameState - The vanilla JS game state object
 */
export function initReactUI(gameState) {
  // Create container for React app if it doesn't exist
  let container = document.getElementById('blazecraft-react-root');

  if (!container) {
    container = document.createElement('div');
    container.id = 'blazecraft-react-root';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 5000;
      pointer-events: none;
    `;
    // Allow clicks on actual interactive elements
    container.addEventListener('click', (e) => {
      if (e.target === container) {
        e.stopPropagation();
      }
    });
    document.body.appendChild(container);
  }

  // Create or update the React root
  if (!root) {
    root = createRoot(container);
  }

  // Render the app
  root.render(
    <React.StrictMode>
      <BlazeCraftApp gameState={gameState} />
    </React.StrictMode>
  );

  // Add global styles for pointer events
  const style = document.createElement('style');
  style.id = 'blazecraft-react-styles';
  style.textContent = `
    #blazecraft-react-root > * {
      pointer-events: auto;
    }

    /* Position the gamification bar in the top area */
    .blazecraft-gamification-bar {
      position: fixed;
      top: 8px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 5001;
      pointer-events: auto;
    }

    @media (max-width: 768px) {
      .blazecraft-gamification-bar {
        top: 6px;
        right: 8px;
        gap: 8px;
      }
    }

    @media (max-width: 480px) {
      .blazecraft-gamification-bar {
        top: 4px;
        right: 4px;
        gap: 4px;
      }
    }

    /* Ensure React components don't block game interactions */
    .tutorial-overlay {
      pointer-events: auto;
    }

    .tutorial-spotlight-overlay {
      pointer-events: auto;
    }

    .mobile-bottom-sheet,
    .mobile-tab-bar,
    .command-wheel,
    .achievements-panel,
    .achievement-toasts {
      pointer-events: auto;
    }
  `;

  // Only add styles once
  if (!document.getElementById('blazecraft-react-styles')) {
    document.head.appendChild(style);
  }

  console.log('[BlazeCraft] React UI initialized');

  return {
    unmount: () => {
      if (root) {
        root.unmount();
        root = null;
      }
      container?.remove();
    },
  };
}

/**
 * Cleanup React app
 */
export function destroyReactUI() {
  if (root) {
    root.unmount();
    root = null;
  }
  document.getElementById('blazecraft-react-root')?.remove();
  document.getElementById('blazecraft-react-styles')?.remove();
}

// Auto-initialize when DOM is ready (for development)
if (typeof window !== 'undefined') {
  // Expose for vanilla JS integration
  window.BlazeCraftReact = {
    init: initReactUI,
    destroy: destroyReactUI,
  };

  // Initialize after the main app loads
  window.addEventListener('blazecraft:ready', (e) => {
    initReactUI(e.detail?.gameState);
  });

  // Also check if already loaded
  if (document.readyState === 'complete' && window.blazeGameState) {
    initReactUI(window.blazeGameState);
  }
}

export default { initReactUI, destroyReactUI };
