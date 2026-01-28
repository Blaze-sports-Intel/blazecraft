/**
 * BSI Agent Bridge Worker
 *
 * Receives agent telemetry (Claude Code + Codex) and streams to BlazeCraft via SSE.
 * Storage: D1 (events + agent state).
 */

import type {
  Env,
  AgentEvent,
  AgentEventRequest,
  AgentEventResponse,
  AgentEventType,
  AgentSource,
  AgentState,
} from './types';

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-BSI-Key',
};

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  ...CORS_HEADERS,
};

const DEFAULT_RETENTION_DAYS = 7;

function getChicagoTimestamp(date = new Date()): string {
  return date.toLocaleString('en-US', {
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

function normalizeSource(source?: AgentSource): AgentSource {
  if (source === 'claude' || source === 'codex' || source === 'system') return source;
  return 'unknown';
}

function formatSSE(event: AgentEvent): string {
  return `event: AGENT_EVENT\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
}

function getAuthKey(env: Env): string | null {
  return env.BSI_AGENT_KEY || env.BSI_API_KEY || null;
}

function isAuthorized(request: Request, env: Env): boolean {
  const required = getAuthKey(env);
  if (!required) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xKey = (request.headers.get('X-BSI-Key') || '').trim();
  return bearer === required || xKey === required;
}

function parseRequestBody(body: unknown): AgentEventRequest[] {
  if (Array.isArray(body)) return body as AgentEventRequest[];
  return [body as AgentEventRequest];
}

function isValidType(type: string): type is AgentEventType {
  return ['spawn', 'task_start', 'task_update', 'task_complete', 'error', 'terminate', 'status'].includes(type);
}

function normalizeTimestamp(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return getChicagoTimestamp(parsed);
}

function buildEvent(payload: AgentEventRequest): AgentEvent | null {
  if (!payload || !payload.agentId || !payload.type) return null;
  if (!isValidType(payload.type)) return null;

  const id = payload.id || generateEventId();
  const now = new Date();
  const timestamp = normalizeTimestamp(payload.timestamp) || getChicagoTimestamp(now);
  const createdAt = getChicagoTimestamp(now);
  const source = normalizeSource(payload.source);
  return {
    id,
    type: payload.type,
    agentId: payload.agentId,
    agentName: payload.agentName,
    timestamp,
    createdAt,
    data: payload.data || {},
    source,
  };
}

function buildAgentState(event: AgentEvent, previous?: AgentState): AgentState {
  const status = event.type === 'task_start' || event.type === 'task_update'
    ? 'working'
    : event.type === 'task_complete'
      ? 'complete'
      : event.type === 'error'
        ? 'blocked'
        : event.type === 'terminate'
          ? 'terminated'
          : event.type === 'spawn'
            ? 'idle'
            : previous?.status || 'idle';

  return {
    agentId: event.agentId,
    agentName: event.agentName || previous?.agentName,
    status,
    currentTask: event.data.task || previous?.currentTask,
    progress: typeof event.data.progress === 'number' ? event.data.progress : previous?.progress,
    tokens: typeof event.data.tokens === 'number' ? event.data.tokens : previous?.tokens,
    updatedAt: event.timestamp,
    source: event.source,
    regionId: event.data.regionId || previous?.regionId,
  };
}

async function ensureSchema(env: Env): Promise<void> {
  await env.BSI_AGENT_DB.exec(
    `CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_name TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at);
    CREATE TABLE IF NOT EXISTS agent_state (
      agent_id TEXT PRIMARY KEY,
      agent_name TEXT,
      status TEXT NOT NULL,
      current_task TEXT,
      progress REAL,
      tokens REAL,
      updated_at TEXT NOT NULL,
      source TEXT NOT NULL,
      region_id TEXT
    );`
  );
}

async function storeEvent(env: Env, event: AgentEvent): Promise<void> {
  await env.BSI_AGENT_DB.prepare(
    `INSERT OR REPLACE INTO agent_events
      (id, type, agent_id, agent_name, timestamp, created_at, data, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id,
    event.type,
    event.agentId,
    event.agentName ?? null,
    event.timestamp,
    event.createdAt,
    JSON.stringify(event.data),
    event.source
  ).run();
}

async function storeState(env: Env, state: AgentState): Promise<void> {
  await env.BSI_AGENT_DB.prepare(
    `INSERT OR REPLACE INTO agent_state
      (agent_id, agent_name, status, current_task, progress, tokens, updated_at, source, region_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    state.agentId,
    state.agentName ?? null,
    state.status,
    state.currentTask ?? null,
    state.progress ?? null,
    state.tokens ?? null,
    state.updatedAt,
    state.source,
    state.regionId ?? null
  ).run();
}

async function pruneOldEvents(env: Env): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEFAULT_RETENTION_DAYS);
  const cutoffTimestamp = getChicagoTimestamp(cutoff);
  await env.BSI_AGENT_DB.prepare(
    'DELETE FROM agent_events WHERE created_at < ?'
  ).bind(cutoffTimestamp).run();
}

async function handlePost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: 'Unauthorized', timestamp: getChicagoTimestamp() }, { status: 401, headers: CORS_HEADERS });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: 'Invalid JSON', timestamp: getChicagoTimestamp() }, { status: 400, headers: CORS_HEADERS });
  }

  await ensureSchema(env);
  const payloads = parseRequestBody(body);
  const acceptedEvents: AgentEvent[] = [];

  for (const payload of payloads) {
    const event = buildEvent(payload);
    if (!event) continue;
    acceptedEvents.push(event);
  }

  if (acceptedEvents.length === 0) {
    return Response.json({ error: 'No valid events', timestamp: getChicagoTimestamp() }, { status: 400, headers: CORS_HEADERS });
  }

  for (const event of acceptedEvents) {
    const existing = await env.BSI_AGENT_DB.prepare(
      'SELECT * FROM agent_state WHERE agent_id = ?'
    ).bind(event.agentId).first<AgentState>();
    const nextState = buildAgentState(event, existing || undefined);
    await storeEvent(env, event);
    await storeState(env, nextState);
  }

  ctx.waitUntil(pruneOldEvents(env));
  const response: AgentEventResponse = { accepted: acceptedEvents.length, timestamp: getChicagoTimestamp() };
  return Response.json(response, { headers: CORS_HEADERS });
}

function parseSince(param: string | null): string | null {
  if (!param) return null;
  if (/^\d+$/.test(param)) {
    const date = new Date(Number(param));
    if (!Number.isNaN(date.getTime())) return getChicagoTimestamp(date);
  }
  const date = new Date(param);
  if (!Number.isNaN(date.getTime())) return getChicagoTimestamp(date);
  return null;
}

async function listEventsSince(env: Env, since: string | null, limit = 100): Promise<AgentEvent[]> {
  const query = since
    ? 'SELECT * FROM agent_events WHERE created_at > ? ORDER BY created_at ASC LIMIT ?'
    : 'SELECT * FROM agent_events ORDER BY created_at DESC LIMIT ?';

  const bindings = since ? [since, limit] : [limit];
  const result = await env.BSI_AGENT_DB.prepare(query).bind(...bindings).all<{
    id: string;
    type: AgentEventType;
    agent_id: string;
    agent_name: string | null;
    timestamp: string;
    created_at: string;
    data: string;
    source: AgentSource;
  }>();

  const rows = since ? result.results : result.results.slice().reverse();
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    agentId: row.agent_id,
    agentName: row.agent_name ?? undefined,
    timestamp: row.timestamp,
    createdAt: row.created_at,
    data: JSON.parse(row.data) as AgentEvent['data'],
    source: row.source,
  }));
}

async function handleStream(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let intervalId: ReturnType<typeof setInterval>;
  let lastSeen = request.headers.get('Last-Event-ID') || '';
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  const since = parseSince(sinceParam);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      await ensureSchema(env);
      const bootEvent: AgentEvent = {
        id: generateEventId(),
        type: 'status',
        agentId: 'system',
        agentName: 'AgentBridge',
        timestamp: getChicagoTimestamp(),
        createdAt: getChicagoTimestamp(),
        data: { status: 'connected' },
        source: 'system',
      };
      controller.enqueue(encoder.encode(formatSSE(bootEvent)));

      let lastTimestamp = since;
      if (!lastTimestamp) {
        const recent = await listEventsSince(env, null, 25);
        for (const event of recent) {
          controller.enqueue(encoder.encode(formatSSE(event)));
          lastTimestamp = event.createdAt;
          lastSeen = event.id;
        }
      }

      intervalId = setInterval(async () => {
        const events = await listEventsSince(env, lastTimestamp, 100);
        for (const event of events) {
          if (lastSeen && event.id === lastSeen) continue;
          controller.enqueue(encoder.encode(formatSSE(event)));
          lastTimestamp = event.createdAt;
          lastSeen = event.id;
        }
      }, 2000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  ctx.waitUntil(Promise.resolve());
  return new Response(stream, { headers: SSE_HEADERS });
}

async function handleHealth(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'bsi-agent-bridge', timestamp: getChicagoTimestamp() }, { headers: CORS_HEADERS });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/agents/, '') || '/';

    if (path === '/health') return handleHealth();
    if (path === '/stream' && request.method === 'GET') return handleStream(request, env, ctx);
    if (path === '/events' && request.method === 'POST') return handlePost(request, env, ctx);

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
