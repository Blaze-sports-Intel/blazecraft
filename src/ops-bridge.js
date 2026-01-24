/**
 * BSI Ops Bridge Client
 *
 * Connects to the bsi-ops-bridge Worker and transforms ops events
 * into BlazeCraft game events (building health, worker spawning, etc.)
 */

import { serviceState, getBuildingForService, getWorkerType, healthToVisualState } from './service-map.js';

/**
 * @typedef {'SERVICE_UP'|'SERVICE_DOWN'|'SERVICE_DEGRADED'|'API_CALL'|'API_RESPONSE'|'ERROR'|'DEPLOYMENT'|'CRON_RUN'} OpsEventType
 * @typedef {'healthy'|'degraded'|'down'|'unknown'} ServiceHealth
 */

/**
 * Ops Bridge client for connecting BlazeCraft to BSI infrastructure.
 */
export class OpsBridge {
  /**
   * @param {object} options
   * @param {string} [options.endpoint] - SSE stream endpoint
   * @param {boolean} [options.demo] - Use demo mode with simulated events
   * @param {(event: object) => void} [options.onEvent] - Callback for game events
   * @param {(metrics: object) => void} [options.onMetrics] - Callback for metrics updates
   * @param {(connected: boolean) => void} [options.onConnection] - Connection status callback
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || '/api/ops/stream';
    this.healthEndpoint = options.healthEndpoint || '/api/ops/health-all';
    this.metricsEndpoint = options.metricsEndpoint || '/api/ops/metrics';
    this.demo = options.demo ?? true;

    this.onEvent = options.onEvent || (() => {});
    this.onMetrics = options.onMetrics || (() => {});
    this.onConnection = options.onConnection || (() => {});

    /** @type {EventSource|null} */
    this.eventSource = null;

    /** @type {ReturnType<typeof setInterval>|null} */
    this.metricsInterval = null;

    /** @type {ReturnType<typeof setInterval>|null} */
    this.demoInterval = null;

    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  /**
   * Connect to the ops bridge.
   */
  async connect() {
    if (this.demo) {
      this.startDemoMode();
      return;
    }

    try {
      // Initial health fetch
      await this.fetchHealth();

      // Start SSE connection
      this.connectSSE();

      // Start metrics polling (every 10 seconds)
      this.metricsInterval = setInterval(() => {
        this.fetchMetrics();
      }, 10000);

    } catch (err) {
      console.warn('[OpsBridge] Connection failed, falling back to demo:', err);
      this.startDemoMode();
    }
  }

  /**
   * Connect to SSE stream.
   */
  connectSSE() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(this.endpoint);

    this.eventSource.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.onConnection(true);
    };

    this.eventSource.onerror = () => {
      this.connected = false;
      this.onConnection(false);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connectSSE(), this.reconnectDelay);
      } else {
        console.warn('[OpsBridge] Max reconnect attempts reached, falling back to demo');
        this.startDemoMode();
      }
    };

    // Handle different event types
    this.eventSource.addEventListener('SERVICE_UP', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('SERVICE_DOWN', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('SERVICE_DEGRADED', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('API_CALL', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('API_RESPONSE', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('ERROR', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('DEPLOYMENT', (e) => this.handleOpsEvent(e));
    this.eventSource.addEventListener('CRON_RUN', (e) => this.handleOpsEvent(e));
  }

  /**
   * Handle incoming ops event and transform to game event.
   * @param {MessageEvent} e
   */
  handleOpsEvent(e) {
    try {
      const opsEvent = JSON.parse(e.data);
      const gameEvent = this.transformToGameEvent(opsEvent);

      // Update service state
      if (opsEvent.serviceId) {
        const health = opsEvent.type === 'SERVICE_UP' ? 'healthy'
          : opsEvent.type === 'SERVICE_DOWN' ? 'down'
          : opsEvent.type === 'SERVICE_DEGRADED' ? 'degraded'
          : 'unknown';

        serviceState.updateHealth(opsEvent.serviceId, health, opsEvent.payload?.latency || 0);
      }

      this.onEvent(gameEvent);
    } catch (err) {
      console.error('[OpsBridge] Failed to parse event:', err);
    }
  }

  /**
   * Transform ops event to BlazeCraft game event.
   * @param {object} opsEvent
   * @returns {object}
   */
  transformToGameEvent(opsEvent) {
    const building = opsEvent.serviceId ? getBuildingForService(opsEvent.serviceId) : null;

    // Map ops events to game events
    switch (opsEvent.type) {
      case 'SERVICE_UP':
        return {
          type: 'building_complete',
          timestamp: Date.now(),
          details: `${opsEvent.payload?.message || 'Service online'}`,
          building,
          category: 'defense',
        };

      case 'SERVICE_DOWN':
        return {
          type: 'building_attacked',
          timestamp: Date.now(),
          details: `${opsEvent.serviceId} is DOWN: ${opsEvent.payload?.details || 'Unknown error'}`,
          building,
          category: 'defense',
          severity: 'critical',
        };

      case 'SERVICE_DEGRADED':
        return {
          type: 'building_damaged',
          timestamp: Date.now(),
          details: `${opsEvent.serviceId} degraded: latency ${opsEvent.payload?.latency}ms`,
          building,
          category: 'defense',
          severity: 'warning',
        };

      case 'API_CALL':
        return {
          type: 'worker_spawn',
          timestamp: Date.now(),
          details: `API request to ${opsEvent.payload?.endpoint || 'unknown'}`,
          workerType: getWorkerType({ type: 'api' }),
          targetBuilding: building,
          category: 'production',
        };

      case 'API_RESPONSE':
        return {
          type: 'worker_complete',
          timestamp: Date.now(),
          details: `Response: ${opsEvent.payload?.status || 'OK'} (${opsEvent.payload?.latency}ms)`,
          category: 'production',
        };

      case 'ERROR':
        return {
          type: 'error',
          timestamp: Date.now(),
          details: opsEvent.payload?.message || 'Error occurred',
          building,
          category: 'repair',
          severity: 'error',
        };

      case 'DEPLOYMENT':
        return {
          type: 'upgrade_complete',
          timestamp: Date.now(),
          details: `Deployed: ${opsEvent.payload?.service || 'unknown'}`,
          building,
          category: 'research',
        };

      case 'CRON_RUN':
        return {
          type: 'worker_spawn',
          timestamp: Date.now(),
          details: `Cron job: ${opsEvent.payload?.job || 'scheduled task'}`,
          workerType: getWorkerType({ type: 'cron' }),
          category: 'production',
        };

      default:
        return {
          type: 'status',
          timestamp: Date.now(),
          details: opsEvent.payload?.message || 'Event received',
          category: 'general',
        };
    }
  }

  /**
   * Fetch current health status for all services.
   */
  async fetchHealth() {
    try {
      const response = await fetch(this.healthEndpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Update service state from health response
      for (const service of data.services || []) {
        serviceState.updateHealth(service.id, service.health, service.latency);
      }

      return data;
    } catch (err) {
      console.warn('[OpsBridge] Health fetch failed:', err);
      return null;
    }
  }

  /**
   * Fetch current metrics.
   */
  async fetchMetrics() {
    try {
      const response = await fetch(this.metricsEndpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      // Update metrics in service state
      if (data.metrics) {
        serviceState.updateMetric('api_requests_per_min', data.metrics.apiRequestsPerMin);
        serviceState.updateMetric('cache_hit_rate', data.metrics.cacheHitRate);
        serviceState.updateMetric('active_connections', data.metrics.activeConnections);
        serviceState.updateMetric('error_rate', data.metrics.errorRate);
      }

      this.onMetrics(data);
      return data;
    } catch (err) {
      console.warn('[OpsBridge] Metrics fetch failed:', err);
      return null;
    }
  }

  /**
   * Start demo mode with simulated events.
   */
  startDemoMode() {
    this.demo = true;
    this.connected = true;
    this.onConnection(true);

    // Simulate initial healthy state
    const services = ['bsi-home', 'highlightly-api', 'bsi-gamebridge', 'bsi-game-db', 'bsi-ops-bridge'];
    for (const serviceId of services) {
      serviceState.updateHealth(serviceId, 'healthy', Math.floor(Math.random() * 100) + 20);
    }

    // Simulate metrics
    serviceState.updateMetric('api_requests_per_min', 75);
    serviceState.updateMetric('cache_hit_rate', 87);
    serviceState.updateMetric('active_connections', 12);
    serviceState.updateMetric('error_rate', 0.5);

    // Generate simulated events
    this.demoInterval = setInterval(() => {
      const eventType = this.getRandomDemoEvent();
      const gameEvent = this.generateDemoEvent(eventType);
      this.onEvent(gameEvent);

      // Update metrics with slight variations
      const currentGold = serviceState.metrics.get('api_requests_per_min') || 75;
      const currentLumber = serviceState.metrics.get('cache_hit_rate') || 87;

      serviceState.updateMetric('api_requests_per_min', Math.max(10, currentGold + (Math.random() * 20 - 10)));
      serviceState.updateMetric('cache_hit_rate', Math.min(100, Math.max(50, currentLumber + (Math.random() * 4 - 2))));

      this.onMetrics(serviceState.getResources());
    }, 5000);
  }

  /**
   * Get a random demo event type.
   * @returns {string}
   */
  getRandomDemoEvent() {
    const events = ['api_call', 'api_response', 'cron_run', 'health_check'];
    const weights = [0.4, 0.35, 0.15, 0.1];

    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < events.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) return events[i];
    }
    return events[0];
  }

  /**
   * Generate a demo game event.
   * @param {string} eventType
   * @returns {object}
   */
  generateDemoEvent(eventType) {
    const services = ['bsi-home', 'highlightly-api', 'bsi-gamebridge'];
    const service = services[Math.floor(Math.random() * services.length)];
    const building = getBuildingForService(service);

    switch (eventType) {
      case 'api_call':
        return {
          type: 'worker_spawn',
          timestamp: Date.now(),
          details: `API request to ${service}`,
          workerType: 'peon',
          targetBuilding: building,
          category: 'production',
        };

      case 'api_response':
        return {
          type: 'worker_complete',
          timestamp: Date.now(),
          details: `Response OK (${Math.floor(Math.random() * 200) + 50}ms)`,
          category: 'production',
        };

      case 'cron_run':
        return {
          type: 'worker_spawn',
          timestamp: Date.now(),
          details: 'Scheduled health check',
          workerType: 'scout',
          category: 'defense',
        };

      case 'health_check':
        return {
          type: 'status',
          timestamp: Date.now(),
          details: `${service} healthy`,
          building,
          category: 'defense',
        };

      default:
        return {
          type: 'status',
          timestamp: Date.now(),
          details: 'Demo event',
          category: 'general',
        };
    }
  }

  /**
   * Set demo mode.
   * @param {boolean} enabled
   */
  setDemoMode(enabled) {
    if (enabled && !this.demo) {
      this.disconnect();
      this.startDemoMode();
    } else if (!enabled && this.demo) {
      if (this.demoInterval) {
        clearInterval(this.demoInterval);
        this.demoInterval = null;
      }
      this.demo = false;
      this.connect();
    }
  }

  /**
   * Disconnect from the ops bridge.
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }

    this.connected = false;
    this.onConnection(false);
  }
}

// Export singleton instance
export const opsBridge = new OpsBridge();
