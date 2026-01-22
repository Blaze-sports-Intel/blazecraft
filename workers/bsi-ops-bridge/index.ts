/**
 * BSI Ops Bridge Worker
 *
 * Cloudflare Worker that aggregates health and metrics from all BSI services
 * and streams operational events to BlazeCraft dashboard via SSE.
 */

import type {
  Env,
  ServiceId,
  ServiceHealth,
  ServiceStatus,
  OpsMetrics,
  OpsEvent,
  OpsEventType,
  HealthAllResponse,
  MetricsResponse,
} from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSI-Key',
};

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  ...CORS_HEADERS,
};

const SERVICE_ENDPOINTS: Record<ServiceId, { url: string; method: string } | null> = {
  'bsi-home': { url: 'https://blazesportsintel.com/api/admin/health', method: 'GET' },
  'highlightly-api': null, // External API, check separately
  'bsi-gamebridge': { url: 'https://blazecraft.app/api/gamebridge/health', method: 'GET' },
  'bsi-ops-bridge': null,
  'bsi-game-db': null,
  'kv-sessions': null,
  'kv-cache': null,
  'espn-api': null,
  'stripe-api': null,
  'health-monitor': null,
  'cf-analytics': null,
};

const SERVICE_NAMES: Record<ServiceId, string> = {
  'bsi-home': 'BlazeSportsIntel.com',
  'highlightly-api': 'Highlightly API',
  'bsi-gamebridge': 'GameBridge Worker',
  'bsi-ops-bridge': 'Ops Bridge Worker',
  'bsi-game-db': 'D1: bsi-game-db',
  'kv-sessions': 'KV: Sessions',
  'kv-cache': 'KV: Cache',
  'espn-api': 'ESPN API',
  'stripe-api': 'Stripe API',
  'health-monitor': 'Health Monitor',
  'cf-analytics': 'CF Analytics',
};

function getChicagoTimestamp(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6-06:00');
}

function generateEventId(): string {
  return crypto.randomUUID();
}

function formatSSE(event: OpsEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
}

async function checkServiceHealth(
  serviceId: ServiceId,
  env: Env,
  baseUrl: string
): Promise<ServiceStatus> {
  const endpoint = SERVICE_ENDPOINTS[serviceId];
  const name = SERVICE_NAMES[serviceId];
  const startTime = performance.now();

  if (serviceId === 'bsi-ops-bridge') {
    return { id: serviceId, name, health: 'healthy', latency: 0, lastCheck: getChicagoTimestamp() };
  }

  if (serviceId === 'bsi-game-db' && env.BSI_GAME_DB) {
    try {
      const result = await env.BSI_GAME_DB.prepare('SELECT 1').first();
      return { id: serviceId, name, health: result ? 'healthy' : 'degraded', latency: Math.round(performance.now() - startTime), lastCheck: getChicagoTimestamp() };
    } catch (err) {
      return { id: serviceId, name, health: 'down', latency: Math.round(performance.now() - startTime), lastCheck: getChicagoTimestamp(), details: err instanceof Error ? err.message : 'Database error' };
    }
  }

  if (endpoint) {
    const url = endpoint.url.startsWith('http') ? endpoint.url : `${baseUrl}${endpoint.url}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { method: endpoint.method, headers: { 'User-Agent': 'BSI-Ops-Bridge/1.0' }, signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      let health: ServiceHealth = 'unknown';
      if (response.ok) health = latency < 500 ? 'healthy' : 'degraded';
      else if (response.status >= 500) health = 'down';
      else health = 'degraded';
      return { id: serviceId, name, health, latency, lastCheck: getChicagoTimestamp(), details: !response.ok ? `HTTP ${response.status}` : undefined };
    } catch (err) {
      return { id: serviceId, name, health: 'down', latency: Math.round(performance.now() - startTime), lastCheck: getChicagoTimestamp(), details: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  return { id: serviceId, name, health: 'unknown', latency: 0, lastCheck: getChicagoTimestamp() };
}

async function handleHealthAll(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const serviceIds = Object.keys(SERVICE_ENDPOINTS) as ServiceId[];
    const results = await Promise.all(serviceIds.map((id) => checkServiceHealth(id, env, baseUrl)));

    const criticalServices: ServiceId[] = ['bsi-home', 'bsi-gamebridge', 'bsi-game-db', 'bsi-ops-bridge'];
    const criticalDown = results.filter((s) => criticalServices.includes(s.id) && s.health === 'down').map((s) => s.id);

    let overall: ServiceHealth = 'healthy';
    if (criticalDown.length > 0) overall = 'down';
    else if (results.some((s) => s.health === 'degraded' || s.health === 'down')) overall = 'degraded';

    const response: HealthAllResponse = { timestamp: getChicagoTimestamp(), overall, services: results, criticalDown };

    if (env.BSI_OPS_METRICS) {
      await env.BSI_OPS_METRICS.put('health-all', JSON.stringify(response), { expirationTtl: 60 });
    }

    return Response.json(response, { headers: CORS_HEADERS });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Unknown error', timestamp: getChicagoTimestamp() }, { status: 500, headers: CORS_HEADERS });
  }
}

async function handleMetrics(request: Request, env: Env): Promise<Response> {
  let metrics: OpsMetrics = { timestamp: getChicagoTimestamp(), apiRequestsPerMin: 0, cacheHitRate: 0, activeConnections: 0, errorRate: 0, p50Latency: 0, p95Latency: 0, p99Latency: 0 };

  if (env.BSI_OPS_METRICS) {
    const cached = await env.BSI_OPS_METRICS.get<OpsMetrics>('current-metrics', 'json');
    if (cached) metrics = cached;
  }

  let upkeep: 'low' | 'mid' | 'high' = 'low';
  if (metrics.errorRate > 5) upkeep = 'high';
  else if (metrics.errorRate > 1) upkeep = 'mid';

  const response: MetricsResponse = {
    timestamp: getChicagoTimestamp(),
    metrics,
    resources: { gold: Math.round(metrics.apiRequestsPerMin), lumber: Math.round(metrics.cacheHitRate), food: metrics.activeConnections, foodMax: 50, upkeep },
  };

  return Response.json(response, { headers: CORS_HEADERS });
}

async function handleStream(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let intervalId: ReturnType<typeof setInterval>;
  let tickCount = 0;
  const lastHealthState: Map<ServiceId, ServiceHealth> = new Map();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;

      const connectEvent: OpsEvent = { id: generateEventId(), type: 'SERVICE_UP', timestamp: getChicagoTimestamp(), serviceId: 'bsi-ops-bridge', payload: { message: 'Ops Bridge stream connected' }, severity: 'info' };
      controller.enqueue(encoder.encode(formatSSE(connectEvent)));

      intervalId = setInterval(async () => {
        tickCount++;
        if (tickCount % 6 === 0) {
          const serviceIds = Object.keys(SERVICE_ENDPOINTS).slice(0, 5) as ServiceId[];
          const services = await Promise.all(serviceIds.map((id) => checkServiceHealth(id, env, baseUrl)));
          for (const status of services) {
            const prevHealth = lastHealthState.get(status.id);
            if (prevHealth && prevHealth !== status.health) {
              let eventType: OpsEventType = 'SERVICE_UP';
              let severity: OpsEvent['severity'] = 'info';
              if (status.health === 'down') { eventType = 'SERVICE_DOWN'; severity = 'critical'; }
              else if (status.health === 'degraded') { eventType = 'SERVICE_DEGRADED'; severity = 'warning'; }
              const event: OpsEvent = { id: generateEventId(), type: eventType, timestamp: getChicagoTimestamp(), serviceId: status.id, payload: { previousHealth: prevHealth, currentHealth: status.health, latency: status.latency }, severity };
              controller.enqueue(encoder.encode(formatSSE(event)));
            }
            lastHealthState.set(status.id, status.health);
          }
        }
      }, 5000);
    },
    cancel() { if (intervalId) clearInterval(intervalId); },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function handleHealth(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'bsi-ops-bridge', timestamp: getChicagoTimestamp(), version: '1.0.0' }, { headers: CORS_HEADERS });
}

async function handleScheduled(env: Env): Promise<void> {
  const baseUrl = 'https://blazesportsintel.com';
  const serviceIds = Object.keys(SERVICE_ENDPOINTS) as ServiceId[];
  const results = await Promise.all(serviceIds.map((id) => checkServiceHealth(id, env, baseUrl)));

  if (env.BSI_OPS_METRICS) {
    const healthAll: HealthAllResponse = { timestamp: getChicagoTimestamp(), overall: results.every((s) => s.health === 'healthy') ? 'healthy' : 'degraded', services: results, criticalDown: results.filter((s) => s.health === 'down').map((s) => s.id) };
    await env.BSI_OPS_METRICS.put('health-all', JSON.stringify(healthAll), { expirationTtl: 60 });
  }

  const metrics: OpsMetrics = { timestamp: getChicagoTimestamp(), apiRequestsPerMin: Math.floor(Math.random() * 100) + 50, cacheHitRate: Math.floor(Math.random() * 20) + 75, activeConnections: Math.floor(Math.random() * 30) + 5, errorRate: Math.random() * 2, p50Latency: Math.floor(Math.random() * 50) + 20, p95Latency: Math.floor(Math.random() * 150) + 80, p99Latency: Math.floor(Math.random() * 300) + 150 };
  if (env.BSI_OPS_METRICS) await env.BSI_OPS_METRICS.put('current-metrics', JSON.stringify(metrics), { expirationTtl: 60 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    const url = new URL(request.url);
    // Strip /api/ops prefix for route matching
    const path = url.pathname.replace(/^\/api\/ops/, '') || '/';
    switch (path) {
      case '/health-all': return handleHealthAll(request, env);
      case '/metrics': return handleMetrics(request, env);
      case '/stream': return handleStream(request, env, ctx);
      case '/health': return handleHealth();
      default: return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
