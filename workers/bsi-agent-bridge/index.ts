import type {
  AgentEvent,
  AgentEventInput,
  AgentEventType,
  AgentSnapshot,
  AgentStatus,
  Env,
  ErrorResponse,
  HealthResponse,
  IngestResponse,
  SnapshotResponse,
} from './types';

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

const EVENT_TYPES: Set<AgentEventType> = new Set([
  'AGENT_SPAWN',
  'TASK_START',
  'TASK_PROGRESS',
  'TASK_COMPLETE',
  'AGENT_ERROR',
  'AGENT_TERMINATED',
  'AGENT_HEARTBEAT',
]);

const STATUS_TYPES: Set<AgentStatus> = new Set([
  'idle',
  'working',
  'moving',
  'blocked',
  'complete',
  'terminated',
  'hold',
]);

function getChicagoTimestamp(ms = Date.now()): string {
  return new Date(ms)
    .toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6-06:00');
}

function formatSSE(event: AgentEvent): string {
  return `event: AGENT_EVENT\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.BSI_API_KEY) return true;
  const headerKey = request.headers.get('X-BSI-Key')?.trim();
  if (headerKey && headerKey === env.BSI_API_KEY) return true;
  const auth = request.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer === env.BSI_API_KEY;
}

function isAgentStatus(value: string | undefined): value is AgentStatus {
  return value ? STATUS_TYPES.has(value as AgentStatus) : false;
}

function inferStatusFromType(type: AgentEventType): AgentStatus {
  switch (type) {
    case 'AGENT_SPAWN':
      return 'idle';
    case 'TASK_START':
    case 'TASK_PROGRESS':
      return 'working';
    case 'TASK_COMPLETE':
      return 'complete';
    case 'AGENT_ERROR':
      return 'blocked';
    case 'AGENT_TERMINATED':
      return 'terminated';
    case 'AGENT_HEARTBEAT':
      return 'idle';
    default:
      return 'idle';
  }
}

function normalizeEvent(input: AgentEventInput, receivedAtMs: number): AgentEvent {
  const timestampMs = Number.isFinite(input.timestampMs) ? (input.timestampMs as number) : receivedAtMs;
  const id = input.id?.trim() || crypto.randomUUID();
  const agentId = input.agentId.trim();
  const agentName = input.agentName?.trim();
  const task = input.task?.trim();
  const details = input.details?.trim();
  const source = input.source;
  const sessionId = input.sessionId?.trim();
  const regionId = input.regionId?.trim();
  const status = isAgentStatus(input.status) ? input.status : inferStatusFromType(input.type);

  return {
    id,
    type: input.type,
    timestamp: getChicagoTimestamp(timestampMs),
    timestampMs,
    agentId,
    agentName,
    status,
    task,
    progress: typeof input.progress === 'number' ? input.progress : undefined,
    tokensUsed: typeof input.tokensUsed === 'number' ? input.tokensUsed : undefined,
    details,
    source,
    sessionId,
    regionId,
  };
}

async function insertEvent(env: Env, event: AgentEvent, payload: AgentEventInput): Promise<void> {
  await env.BSI_AGENT_DB.prepare(
    `INSERT INTO agent_events (
      id, type, timestamp, timestamp_ms, agent_id, agent_name, status,
      task, progress, tokens_used, details, source, session_id, region_id, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      event.id,
      event.type,
      event.timestamp,
      event.timestampMs,
      event.agentId,
      event.agentName ?? null,
      event.status ?? null,
      event.task ?? null,
      event.progress ?? null,
      event.tokensUsed ?? null,
      event.details ?? null,
      event.source ?? null,
      event.sessionId ?? null,
      event.regionId ?? null,
      JSON.stringify(payload)
    )
    .run();

  await env.BSI_AGENT_DB.prepare(
    `INSERT INTO agent_status (
      agent_id, agent_name, status, task, progress, tokens_used,
      updated_at, updated_at_ms, source, session_id, region_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      agent_name = excluded.agent_name,
      status = excluded.status,
      task = excluded.task,
      progress = excluded.progress,
      tokens_used = excluded.tokens_used,
      updated_at = excluded.updated_at,
      updated_at_ms = excluded.updated_at_ms,
      source = excluded.source,
      session_id = excluded.session_id,
      region_id = excluded.region_id`
  )
    .bind(
      event.agentId,
      event.agentName ?? null,
      event.status ?? null,
      event.task ?? null,
      event.progress ?? null,
      event.tokensUsed ?? null,
      event.timestamp,
      event.timestampMs,
      event.source ?? null,
      event.sessionId ?? null,
      event.regionId ?? null
    )
    .run();
}

async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    const response: ErrorResponse = { error: 'Unauthorized', timestamp: getChicagoTimestamp() };
    return Response.json(response, { status: 401, headers: CORS_HEADERS });
  }

  let body: AgentEventInput | { events: AgentEventInput[] };
  try {
    body = await request.json();
  } catch (err) {
    const response: ErrorResponse = { error: 'Invalid JSON body', timestamp: getChicagoTimestamp() };
    return Response.json(response, { status: 400, headers: CORS_HEADERS });
  }

  const events = Array.isArray((body as { events: AgentEventInput[] }).events)
    ? (body as { events: AgentEventInput[] }).events
    : [body as AgentEventInput];

  let accepted = 0;
  let rejected = 0;
  const ids: string[] = [];
  const receivedAtMs = Date.now();

  for (const eventInput of events) {
    if (!eventInput || typeof eventInput.agentId !== 'string' || eventInput.agentId.trim() === '' || !EVENT_TYPES.has(eventInput.type)) {
      rejected++;
      continue;
    }

    const normalized = normalizeEvent(eventInput, receivedAtMs);
    await insertEvent(env, normalized, eventInput);
    accepted++;
    ids.push(normalized.id);
  }

  const response: IngestResponse = {
    accepted,
    rejected,
    ids,
    timestamp: getChicagoTimestamp(),
  };

  return Response.json(response, { headers: CORS_HEADERS });
}

async function handleSnapshot(): Promise<Response> {
  const response: SnapshotResponse = { timestamp: getChicagoTimestamp(), agents: [] };
  return Response.json(response, { headers: CORS_HEADERS });
}

async function handleSnapshotDb(env: Env): Promise<Response> {
  const results = await env.BSI_AGENT_DB.prepare(
    `SELECT agent_id as agentId, agent_name as agentName, status, task, progress, tokens_used as tokensUsed,
      updated_at as updatedAt, updated_at_ms as updatedAtMs, source, session_id as sessionId, region_id as regionId
     FROM agent_status
     ORDER BY updated_at_ms DESC
     LIMIT 500`
  ).all<AgentSnapshot>();

  const response: SnapshotResponse = {
    timestamp: getChicagoTimestamp(),
    agents: results.results || [],
  };

  return Response.json(response, { headers: CORS_HEADERS });
}

async function handleStream(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  const sinceMs = sinceParam ? Number.parseInt(sinceParam, 10) : Date.now() - 5 * 60 * 1000;
  let lastTimestamp = Number.isFinite(sinceMs) ? sinceMs : Date.now() - 5 * 60 * 1000;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`: connected ${getChicagoTimestamp()}\n\n`));

      heartbeatId = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${getChicagoTimestamp()}\n\n`));
      }, 15000);

      intervalId = setInterval(async () => {
        const events = await env.BSI_AGENT_DB.prepare(
          `SELECT id, type, timestamp, timestamp_ms as timestampMs, agent_id as agentId, agent_name as agentName,
            status, task, progress, tokens_used as tokensUsed, details, source, session_id as sessionId, region_id as regionId
           FROM agent_events
           WHERE timestamp_ms > ?
           ORDER BY timestamp_ms ASC
           LIMIT 100`
        )
          .bind(lastTimestamp)
          .all<AgentEvent>();

        if (!events.results || events.results.length === 0) {
          return;
        }

        for (const event of events.results) {
          const encoded = formatSSE(event);
          controller.enqueue(encoder.encode(encoded));
          if (event.timestampMs > lastTimestamp) {
            lastTimestamp = event.timestampMs;
          }
        }
      }, 2000);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
      if (heartbeatId) clearInterval(heartbeatId);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

async function handleHealth(): Promise<Response> {
  const response: HealthResponse = {
    status: 'ok',
    service: 'bsi-agent-bridge',
    timestamp: getChicagoTimestamp(),
    version: '1.0.0',
  };
  return Response.json(response, { headers: CORS_HEADERS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/agents/, '') || '/';

    if (request.method === 'POST' && path === '/events') {
      return handleIngest(request, env);
    }

    if (request.method === 'GET' && path === '/stream') {
      return handleStream(request, env);
    }

    if (request.method === 'GET' && path === '/snapshot') {
      if (!env.BSI_AGENT_DB) {
        return handleSnapshot();
      }
      return handleSnapshotDb(env);
    }

    if (request.method === 'GET' && path === '/health') {
      return handleHealth();
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};
