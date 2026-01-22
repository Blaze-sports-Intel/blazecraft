/**
 * BSI GameBridge Worker
 *
 * Cloudflare Worker that bridges BSI sports data to BlazeCraft game events via SSE.
 * Transforms real sports signals into RTS gameplay pressure and opportunity windows.
 */

import type {
  Env,
  BlazeCraftEvent,
  BlazeCraftEventType,
  EventPayload,
  ClientMode,
  SubscriptionTier,
  League,
  GameSnapshot,
  LiveGameState,
  WorldTickPayload,
  GameEventPayload,
  EventSource,
  SSEClient,
} from './types';

import { SimFeed } from './sim-feed';
import { EventTransformer } from './transformer';
import { getSnapshotWithFallback } from './bsi-fetcher';
import { deltaDetector } from './delta-detector';
import type { GameSnapshot } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BSI-Tier, X-BSI-Key',
};

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  ...CORS_HEADERS,
};

/** Events accessible per tier */
const TIER_ACCESS: Record<SubscriptionTier, BlazeCraftEventType[]> = {
  free: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'STANDINGS_DELTA', 'INJURY_ALERT', 'OPS_HEARTBEAT', 'OPS_DEGRADED', 'OPS_RECOVERED'],
  pro: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'STANDINGS_DELTA', 'INJURY_ALERT', 'LINEUP_POSTED', 'ODDS_SHIFT', 'HIGHLIGHT_CLIP', 'OPS_HEARTBEAT', 'OPS_DEGRADED', 'OPS_RECOVERED'],
  enterprise: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'STANDINGS_DELTA', 'INJURY_ALERT', 'LINEUP_POSTED', 'ODDS_SHIFT', 'HIGHLIGHT_CLIP', 'MOMENTUM_SWING', 'OPS_HEARTBEAT', 'OPS_DEGRADED', 'OPS_RECOVERED'],
};

/** Events per mode */
const MODE_EVENTS: Record<ClientMode, BlazeCraftEventType[]> = {
  spectator: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'OPS_HEARTBEAT'],
  manager: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'STANDINGS_DELTA', 'INJURY_ALERT', 'OPS_HEARTBEAT', 'OPS_DEGRADED', 'OPS_RECOVERED'],
  commander: ['WORLD_TICK', 'GAME_START', 'GAME_UPDATE', 'GAME_FINAL', 'STANDINGS_DELTA', 'INJURY_ALERT', 'LINEUP_POSTED', 'ODDS_SHIFT', 'HIGHLIGHT_CLIP', 'MOMENTUM_SWING', 'OPS_HEARTBEAT', 'OPS_DEGRADED', 'OPS_RECOVERED'],
};

/** Rate limit: 100 requests per minute */
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60000;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/** Get ops events from KV since a given timestamp */
async function getOpsDeltasSince(env: Env, since: number): Promise<BlazeCraftEvent[]> {
  if (!env.BSI_OPS_DELTAS) return [];

  const events: BlazeCraftEvent[] = [];
  const list = await env.BSI_OPS_DELTAS.list({ prefix: 'delta:' });

  for (const key of list.keys) {
    const timestamp = parseInt(key.name.split(':')[1], 10);
    if (timestamp > since) {
      const data = await env.BSI_OPS_DELTAS.get<BlazeCraftEvent[]>(key.name, 'json');
      if (data) {
        events.push(...data);
      }
    }
  }

  return events;
}

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

function generateEventId(): string {
  return crypto.randomUUID();
}

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

function formatSSE(event: BlazeCraftEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
}

function parseLeagues(param: string | null): League[] {
  if (!param) return ['mlb', 'nfl', 'ncaaf'];
  return param.split(',').filter((l): l is League =>
    ['mlb', 'nfl', 'ncaaf', 'nba', 'nhl'].includes(l)
  );
}

function parseMode(param: string | null): ClientMode {
  if (param === 'manager' || param === 'commander') return param;
  return 'spectator';
}

function parseTier(header: string | null): SubscriptionTier {
  if (header === 'pro' || header === 'enterprise') return header;
  return 'free';
}

function filterEvent(
  event: BlazeCraftEvent,
  mode: ClientMode,
  tier: SubscriptionTier,
  leagues: League[]
): boolean {
  // Check mode access
  if (!MODE_EVENTS[mode].includes(event.type)) {
    return false;
  }

  // Check tier access
  if (!TIER_ACCESS[tier].includes(event.type)) {
    return false;
  }

  // Check league filter if event has game context
  if (event.gameContext && !leagues.includes(event.gameContext.league)) {
    return false;
  }

  return true;
}

async function handleStream(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const mode = parseMode(url.searchParams.get('mode'));
  const leagues = parseLeagues(url.searchParams.get('leagues'));
  const teams = url.searchParams.get('teams')?.split(',') || [];
  const tier = parseTier(request.headers.get('X-BSI-Tier'));

  // Use demo mode if explicitly requested OR if BSI_API_KEY is not configured
  const demoRequested = url.searchParams.get('demo') === 'true';
  const demo = demoRequested || !env.BSI_API_KEY;

  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response('Rate limit exceeded', { status: 429, headers: CORS_HEADERS });
  }

  const simFeed = demo ? new SimFeed() : null;
  let lastDeltaPoll = Date.now();
  let lastOpsPoll = Date.now();

  let intervalId: ReturnType<typeof setInterval>;
  let tickCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Get initial live game count
      let liveGameCount = 0;
      if (!demo && env.BSI_GAMEBRIDGE_SNAPSHOT) {
        const snapshot = await env.BSI_GAMEBRIDGE_SNAPSHOT.get<GameSnapshot>('current', 'json');
        if (snapshot) {
          liveGameCount = snapshot.liveGames.filter((g) => g.status === 'live').length;
        }
      } else if (simFeed) {
        liveGameCount = simFeed.getLiveGameCount();
      }

      // Send initial world tick
      const initialTick = createWorldTick(liveGameCount, demo ? 'sim' : 'bsi');
      if (filterEvent(initialTick, mode, tier, leagues)) {
        controller.enqueue(encoder.encode(formatSSE(initialTick)));
      }

      // Main event loop
      intervalId = setInterval(async () => {
        tickCount++;

        // World tick every 30 seconds
        if (tickCount % 6 === 0) {
          let currentLiveCount = liveGameCount;

          if (!demo && env.BSI_GAMEBRIDGE_SNAPSHOT) {
            const snapshot = await env.BSI_GAMEBRIDGE_SNAPSHOT.get<GameSnapshot>('current', 'json');
            if (snapshot) {
              currentLiveCount = snapshot.liveGames.filter((g) => g.status === 'live').length;
            }
          } else if (simFeed) {
            currentLiveCount = simFeed.getLiveGameCount();
          }

          const tick = createWorldTick(currentLiveCount, demo ? 'sim' : 'bsi');
          if (filterEvent(tick, mode, tier, leagues)) {
            controller.enqueue(encoder.encode(formatSSE(tick)));
          }
        }

        if (demo && simFeed) {
          // Generate sim events in demo mode
          const events = simFeed.tick();
          for (const event of events) {
            if (filterEvent(event, mode, tier, leagues)) {
              controller.enqueue(encoder.encode(formatSSE(event)));
            }
          }
        } else if (!demo && env.BSI_GAMEBRIDGE_DELTAS) {
          // Poll deltas from KV for live mode
          const events = await deltaDetector.getDeltasSince(env, lastDeltaPoll);
          lastDeltaPoll = Date.now();

          for (const event of events) {
            if (filterEvent(event, mode, tier, leagues)) {
              controller.enqueue(encoder.encode(formatSSE(event)));
            }
          }
        }

        // Poll ops events (always, independent of demo mode)
        if (env.BSI_OPS_DELTAS) {
          const opsEvents = await getOpsDeltasSince(env, lastOpsPoll);
          lastOpsPoll = Date.now();

          for (const event of opsEvents) {
            if (filterEvent(event, mode, tier, leagues)) {
              controller.enqueue(encoder.encode(formatSSE(event)));
            }
          }
        }
      }, 5000); // 5 second intervals, world tick at 30s
    },

    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function createWorldTick(liveGames: number, source: EventSource): BlazeCraftEvent {
  const payload: WorldTickPayload = {
    type: 'WORLD_TICK',
    liveGames,
    serverTime: getChicagoTimestamp(),
  };

  return {
    id: generateEventId(),
    type: 'WORLD_TICK',
    timestamp: getChicagoTimestamp(),
    source,
    priority: 3,
    payload,
  };
}

async function handleSnapshot(
  request: Request,
  env: Env
): Promise<Response> {
  const snapshot: GameSnapshot = {
    liveGames: [],
    standings: [],
    lastUpdated: getChicagoTimestamp(),
    source: 'sim',
  };

  // Try to get cached snapshot from KV
  if (env.BSI_GAMEBRIDGE_SNAPSHOT) {
    try {
      const cached = await env.BSI_GAMEBRIDGE_SNAPSHOT.get('current', 'json');
      if (cached) {
        return Response.json(cached, { headers: CORS_HEADERS });
      }
    } catch {
      // Fall through to default snapshot
    }
  }

  return Response.json(snapshot, { headers: CORS_HEADERS });
}

async function handleHealth(request: Request): Promise<Response> {
  return Response.json({
    status: 'ok',
    timestamp: getChicagoTimestamp(),
    version: '1.0.0',
  }, { headers: CORS_HEADERS });
}

async function handleSimEvent(
  request: Request,
  env: Env
): Promise<Response> {
  // Dev-only endpoint for injecting simulated events
  if (env.ENVIRONMENT === 'production') {
    return new Response('Not available in production', { status: 403, headers: CORS_HEADERS });
  }

  try {
    const body = await request.json() as Partial<BlazeCraftEvent>;
    const event: BlazeCraftEvent = {
      id: generateEventId(),
      type: body.type || 'WORLD_TICK',
      timestamp: getChicagoTimestamp(),
      source: 'sim',
      priority: body.priority || 3,
      payload: body.payload || { type: 'WORLD_TICK', liveGames: 0, serverTime: getChicagoTimestamp() },
      gameContext: body.gameContext,
    };

    return Response.json({ success: true, event }, { headers: CORS_HEADERS });
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }
}

/**
 * Scheduled handler for cron-triggered polling of live sports data.
 * Fetches from Highlightly API, detects deltas, stores to KV.
 */
async function handleScheduled(env: Env, ctx: ExecutionContext): Promise<void> {
  // Skip if no API key configured
  if (!env.BSI_API_KEY) {
    console.log('BSI_API_KEY not configured, skipping scheduled poll');
    return;
  }

  try {
    // Get previous snapshot from KV
    let previousSnapshot: GameSnapshot | null = null;
    if (env.BSI_GAMEBRIDGE_SNAPSHOT) {
      previousSnapshot = await env.BSI_GAMEBRIDGE_SNAPSHOT.get<GameSnapshot>('current', 'json');
    }

    // Fetch current snapshot from Highlightly API
    const currentSnapshot = await getSnapshotWithFallback(env);

    // Detect changes and generate events
    const { events, updatedSnapshot } = deltaDetector.detect(previousSnapshot, currentSnapshot);

    // Store updated snapshot to KV
    if (env.BSI_GAMEBRIDGE_SNAPSHOT) {
      await env.BSI_GAMEBRIDGE_SNAPSHOT.put('current', JSON.stringify(updatedSnapshot), {
        expirationTtl: 300, // 5 minutes
      });
    }

    // Store delta events for SSE clients to poll
    if (events.length > 0) {
      await deltaDetector.storeDelta(env, events);
      console.log(`Stored ${events.length} events to deltas KV`);
    }
  } catch (err) {
    console.error('Scheduled poll failed:', err);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    // Normalize path: strip /api/gamebridge prefix if present
    const rawPath = url.pathname;
    const path = rawPath.startsWith('/api/gamebridge')
      ? rawPath.replace('/api/gamebridge', '') || '/'
      : rawPath;

    // Route requests
    switch (path) {
      case '/stream':
        return handleStream(request, env, ctx);
      case '/snapshot':
        return handleSnapshot(request, env);
      case '/health':
        return handleHealth(request);
      case '/sim/event':
        if (request.method === 'POST') {
          return handleSimEvent(request, env);
        }
        return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
      default:
        return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env, ctx));
  },
};
