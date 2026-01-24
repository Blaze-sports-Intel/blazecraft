/**
 * BSI Service → Game Entity Mapping
 *
 * Maps real BSI infrastructure services to BlazeCraft game entities.
 * Buildings represent static infrastructure, workers represent active requests/tasks.
 */

/**
 * @typedef {'healthy'|'degraded'|'down'|'unknown'} ServiceHealth
 * @typedef {'building'|'worker'|'resource'} EntityType
 */

/**
 * BSI Service definitions with game mappings.
 */
export const BSI_SERVICES = {
  // Core Infrastructure
  'bsi-home': {
    name: 'BlazeSportsIntel.com',
    description: 'Main website and dashboard',
    healthEndpoint: '/health',
    healthType: 'internal',
    timeout: 5000,
    building: 'townhall',
    tier: 1,
    critical: true,
  },
  'highlightly-api': {
    name: 'Highlightly API',
    description: 'Pro sports data provider',
    healthEndpoint: 'https://api.highlightly.net/v1/health',
    healthType: 'external',
    timeout: 8000,
    building: 'goldmine',
    tier: 1,
    critical: true,
  },
  'bsi-gamebridge': {
    name: 'GameBridge Worker',
    description: 'Cloudflare Worker for sports data streaming',
    healthEndpoint: '/api/gamebridge/health',
    healthType: 'internal',
    timeout: 5000,
    building: 'barracks',
    tier: 1,
    critical: true,
  },

  // Data Layer
  'bsi-game-db': {
    name: 'D1: bsi-game-db',
    description: 'Primary D1 database for game data',
    healthEndpoint: '/api/health/d1',
    healthType: 'internal',
    timeout: 5000,
    building: 'library',
    tier: 2,
    critical: true,
  },
  'kv-sessions': {
    name: 'KV: BSI_SESSIONS',
    description: 'Session storage KV namespace',
    healthEndpoint: '/api/health/kv?ns=sessions',
    healthType: 'internal',
    timeout: 3000,
    building: 'farm',
    tier: 2,
    critical: false,
  },
  'kv-cache': {
    name: 'KV: BSI_CACHE',
    description: 'General cache KV namespace',
    healthEndpoint: '/api/health/kv?ns=cache',
    healthType: 'internal',
    timeout: 3000,
    building: 'farm',
    tier: 2,
    critical: false,
  },

  // External APIs
  'espn-api': {
    name: 'ESPN API',
    description: 'ESPN sports data (fallback)',
    healthEndpoint: 'https://site.api.espn.com/apis/site/v2/sports',
    healthType: 'external',
    timeout: 5000,
    building: 'lumber',
    tier: 2,
    critical: false,
  },
  'stripe-api': {
    name: 'Stripe API',
    description: 'Payment processing',
    healthEndpoint: 'https://status.stripe.com/api/v2/status.json',
    healthType: 'external',
    timeout: 5000,
    building: 'blacksmith',
    tier: 2,
    critical: false,
  },

  // Monitoring
  'health-monitor': {
    name: 'Health Monitor',
    description: 'Uptime and health monitoring',
    healthEndpoint: '/api/health/monitor',
    healthType: 'internal',
    timeout: 3000,
    building: 'tower',
    tier: 2,
    critical: false,
  },
  'cf-analytics': {
    name: 'Cloudflare Analytics',
    description: 'Traffic and performance analytics',
    healthEndpoint: '/api/health/analytics',
    healthType: 'internal',
    timeout: 5000,
    building: 'stables',
    tier: 3,
    critical: false,
  },

  // New: Ops Bridge
  'bsi-ops-bridge': {
    name: 'Ops Bridge Worker',
    description: 'BlazeCraft operations bridge',
    healthEndpoint: '/api/ops/health',
    healthType: 'internal',
    timeout: 5000,
    building: 'workshop',
    tier: 1,
    critical: true,
  },
};

/**
 * Building → BSI Service reverse lookup
 */
export const BUILDING_TO_SERVICE = Object.entries(BSI_SERVICES).reduce((acc, [serviceId, config]) => {
  acc[config.building] = serviceId;
  return acc;
}, {});

/**
 * Worker types representing different request/task types.
 */
export const WORKER_TYPES = {
  peon: {
    name: 'Peon',
    description: 'API request in flight',
    color: '#FFB17A',
    speed: 1.0,
  },
  scout: {
    name: 'Scout',
    description: 'Health check probe',
    color: '#37d67a',
    speed: 1.5,
  },
  footman: {
    name: 'Footman',
    description: 'Cron job execution',
    color: '#E86C2C',
    speed: 0.8,
  },
  archer: {
    name: 'Archer',
    description: 'SSE connection',
    color: '#6a9eff',
    speed: 0.5,
  },
  mage: {
    name: 'Mage',
    description: 'Database query',
    color: '#9370DB',
    speed: 0.7,
  },
};

/**
 * Resource mappings (WC3 resources → BSI metrics)
 */
export const RESOURCE_MAPPING = {
  gold: {
    name: 'Gold',
    metric: 'api_requests_per_min',
    description: 'API requests per minute',
    icon: 'gold',
    thresholds: { low: 10, medium: 100, high: 500 },
  },
  lumber: {
    name: 'Lumber',
    metric: 'cache_hit_rate',
    description: 'Cache hit rate percentage',
    icon: 'lumber',
    thresholds: { low: 50, medium: 80, high: 95 },
  },
  food: {
    name: 'Food',
    metric: 'active_connections',
    description: 'Active WebSocket/SSE connections',
    icon: 'food',
    max: 50,
  },
  upkeep: {
    name: 'Upkeep',
    metric: 'error_rate',
    description: 'Error rate (errors per 100 requests)',
    icon: 'upkeep',
    thresholds: { low: 1, medium: 5, high: 10 },
  },
};

/**
 * Get the building type for a given service ID.
 * @param {string} serviceId
 * @returns {string|null}
 */
export function getBuildingForService(serviceId) {
  return BSI_SERVICES[serviceId]?.building || null;
}

/**
 * Get the service ID for a given building type.
 * @param {string} buildingType
 * @returns {string|null}
 */
export function getServiceForBuilding(buildingType) {
  return BUILDING_TO_SERVICE[buildingType] || null;
}

/**
 * Get worker type based on request characteristics.
 * @param {object} request
 * @returns {string}
 */
export function getWorkerType(request) {
  if (request.type === 'health_check') return 'scout';
  if (request.type === 'cron') return 'footman';
  if (request.type === 'sse' || request.type === 'websocket') return 'archer';
  if (request.type === 'database') return 'mage';
  return 'peon';
}

/**
 * Convert health status to building visual state.
 * @param {ServiceHealth} health
 * @returns {{ color: string, animation: string|null, overlay: string|null }}
 */
export function healthToVisualState(health) {
  switch (health) {
    case 'healthy':
      return { color: '#37d67a', animation: null, overlay: null };
    case 'degraded':
      return { color: '#f7c948', animation: 'pulse', overlay: 'warning' };
    case 'down':
      return { color: '#ff4d4d', animation: 'shake', overlay: 'fire' };
    default:
      return { color: '#808080', animation: null, overlay: 'fog' };
  }
}

/**
 * Calculate upkeep level from error rate.
 * @param {number} errorRate - Errors per 100 requests
 * @returns {'low'|'mid'|'high'}
 */
export function calculateUpkeep(errorRate) {
  if (errorRate <= RESOURCE_MAPPING.upkeep.thresholds.low) return 'low';
  if (errorRate <= RESOURCE_MAPPING.upkeep.thresholds.medium) return 'mid';
  return 'high';
}

/**
 * Service state manager for tracking health across all BSI services.
 */
export class ServiceStateManager {
  constructor() {
    /** @type {Map<string, { health: ServiceHealth, lastCheck: number, latency: number }>} */
    this.services = new Map();

    /** @type {Map<string, number>} */
    this.metrics = new Map();

    this.listeners = new Set();
  }

  /**
   * Update a service's health status.
   * @param {string} serviceId
   * @param {ServiceHealth} health
   * @param {number} [latency]
   */
  updateHealth(serviceId, health, latency = 0) {
    this.services.set(serviceId, {
      health,
      lastCheck: Date.now(),
      latency,
    });
    this.notify();
  }

  /**
   * Update a metric value.
   * @param {string} metricKey
   * @param {number} value
   */
  updateMetric(metricKey, value) {
    this.metrics.set(metricKey, value);
    this.notify();
  }

  /**
   * Get current resources in WC3 format.
   * @returns {{ gold: number, lumber: number, food: number, foodMax: number, upkeep: string }}
   */
  getResources() {
    return {
      gold: this.metrics.get('api_requests_per_min') || 0,
      lumber: this.metrics.get('cache_hit_rate') || 0,
      food: this.metrics.get('active_connections') || 0,
      foodMax: RESOURCE_MAPPING.food.max,
      upkeep: calculateUpkeep(this.metrics.get('error_rate') || 0),
    };
  }

  /**
   * Get all service states.
   * @returns {Array<{ id: string, config: object, state: object }>}
   */
  getAllServices() {
    return Object.entries(BSI_SERVICES).map(([id, config]) => ({
      id,
      config,
      state: this.services.get(id) || { health: 'unknown', lastCheck: 0, latency: 0 },
    }));
  }

  /**
   * Get critical services that are down.
   * @returns {Array<string>}
   */
  getCriticalDown() {
    return Object.entries(BSI_SERVICES)
      .filter(([id, config]) => {
        if (!config.critical) return false;
        const state = this.services.get(id);
        return state?.health === 'down';
      })
      .map(([id]) => id);
  }

  /** @param {Function} fn */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this);
  }
}

/**
 * Perform a health check for a given service with timeout handling.
 * @param {string} serviceId
 * @param {string} [baseUrl=''] - Base URL for internal endpoints
 * @returns {Promise<{ health: ServiceHealth, latency: number, error?: string }>}
 */
export async function checkServiceHealth(serviceId, baseUrl = '') {
  const service = BSI_SERVICES[serviceId];
  if (!service || !service.healthEndpoint) {
    return { health: 'unknown', latency: 0, error: 'No health endpoint configured' };
  }

  const url =
    service.healthType === 'external'
      ? service.healthEndpoint
      : `${baseUrl}${service.healthEndpoint}`;

  const timeout = service.timeout || 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        health: response.status >= 500 ? 'down' : 'degraded',
        latency,
        error: `HTTP ${response.status}`,
      };
    }

    // Determine health based on latency thresholds
    if (latency > timeout * 0.8) {
      return { health: 'degraded', latency };
    }

    return { health: 'healthy', latency };
  } catch (err) {
    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    if (err.name === 'AbortError') {
      return { health: 'down', latency: timeout, error: 'Request timeout' };
    }

    return { health: 'down', latency, error: err.message };
  }
}

/**
 * Check health for all configured services.
 * @param {string} [baseUrl=''] - Base URL for internal endpoints
 * @returns {Promise<Map<string, { health: ServiceHealth, latency: number }>>}
 */
export async function checkAllServicesHealth(baseUrl = '') {
  const results = new Map();
  const serviceIds = Object.keys(BSI_SERVICES);

  const checks = await Promise.allSettled(
    serviceIds.map(async (id) => {
      const result = await checkServiceHealth(id, baseUrl);
      return { id, ...result };
    })
  );

  for (const check of checks) {
    if (check.status === 'fulfilled') {
      const { id, ...result } = check.value;
      results.set(id, result);
    }
  }

  return results;
}

// Singleton instance
export const serviceState = new ServiceStateManager();
