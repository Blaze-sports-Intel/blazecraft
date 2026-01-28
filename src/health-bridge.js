/**
 * Health Bridge
 *
 * Fetches real-time health status from agent-gateway.
 * Falls back gracefully when gateway is unreachable.
 */

import { config } from './config.js';

/**
 * @typedef {Object} HealthStatus
 * @property {'up' | 'down' | 'degraded' | 'unknown'} status
 * @property {number} latency_ms
 * @property {string} checked_at
 * @property {string} url
 */

/**
 * @typedef {Object} HealthHistory
 * @property {'up' | 'down' | 'degraded'} status
 * @property {number} latency_ms
 * @property {string} checked_at
 */

/**
 * @typedef {Object} HealthResponse
 * @property {HealthStatus | null} current
 * @property {HealthHistory[]} history
 */

const FETCH_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 30000;

export class HealthBridge {
  /** @type {HealthResponse | null} */
  #lastResponse = null;

  /** @type {number | null} */
  #pollInterval = null;

  /** @type {((response: HealthResponse) => void)[]} */
  #listeners = [];

  /**
   * Fetch current health status from gateway
   * @returns {Promise<HealthResponse>}
   */
  async fetchHealth() {
    if (config.demo) {
      return this.#getDemoHealth();
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(config.endpoints.gatewayHealth, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      /** @type {HealthResponse} */
      const data = await response.json();
      this.#lastResponse = data;
      this.#notifyListeners(data);
      return data;
    } catch (err) {
      console.warn('[HealthBridge] Failed to fetch health:', err);

      // Return error response to notify listeners
      /** @type {HealthResponse & { error?: boolean }} */
      const errorResponse = {
        current: null,
        history: [],
        error: true,
      };
      this.#notifyListeners(errorResponse);

      // Return last known or unknown status for the return value
      const fallback = this.#lastResponse || {
        current: {
          status: /** @type {'unknown'} */ ('unknown'),
          latency_ms: 0,
          checked_at: new Date().toISOString(),
          url: config.endpoints.gatewayHealth,
        },
        history: [],
      };

      return fallback;
    }
  }

  /**
   * Start polling for health updates
   */
  startPolling() {
    if (this.#pollInterval) return;

    // Initial fetch
    this.fetchHealth();

    // Poll every 30 seconds
    this.#pollInterval = window.setInterval(() => {
      this.fetchHealth();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Immediately check health (for retry functionality)
   */
  checkNow() {
    this.fetchHealth();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.#pollInterval) {
      window.clearInterval(this.#pollInterval);
      this.#pollInterval = null;
    }
  }

  /**
   * Subscribe to health updates
   * @param {(response: HealthResponse) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this.#listeners.push(callback);

    // Send current data immediately if available
    if (this.#lastResponse) {
      callback(this.#lastResponse);
    }

    return () => {
      const idx = this.#listeners.indexOf(callback);
      if (idx !== -1) this.#listeners.splice(idx, 1);
    };
  }

  /**
   * @param {HealthResponse} response
   */
  #notifyListeners(response) {
    for (const listener of this.#listeners) {
      try {
        listener(response);
      } catch (err) {
        console.error('[HealthBridge] Listener error:', err);
      }
    }
  }

  /**
   * Generate demo health data
   * @returns {HealthResponse}
   */
  #getDemoHealth() {
    const now = new Date();
    const statuses = /** @type {const} */ (['up', 'up', 'up', 'degraded']);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const latency = 100 + Math.floor(Math.random() * 200);

    /** @type {HealthResponse} */
    const response = {
      current: {
        status,
        latency_ms: latency,
        checked_at: now.toISOString(),
        url: 'https://blazesportsintel.com/',
      },
      history: Array.from({ length: 12 }, (_, i) => ({
        status: /** @type {'up'} */ ('up'),
        latency_ms: 100 + Math.floor(Math.random() * 150),
        checked_at: new Date(now.getTime() - i * 5 * 60 * 1000).toISOString(),
      })),
    };

    this.#lastResponse = response;
    this.#notifyListeners(response);
    return response;
  }

  /**
   * Get last known health status
   * @returns {HealthResponse | null}
   */
  getLastResponse() {
    return this.#lastResponse;
  }
}

export default HealthBridge;
