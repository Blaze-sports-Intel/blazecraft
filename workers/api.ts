export interface Env {
  BLAZECRAFT_CACHE: KVNamespace;
  HISTORICAL_DB: D1Database;
  HISTORICAL_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  TIMEZONE: string;
  MLB_STATS_API_BASE: string;
  CACHE_TTL_SECONDS: string;
  HISTORICAL_TTL_SECONDS: string;
}

interface SourceCitation {
  name: string;
  url: string;
  confidence: number;
}

interface ApiMetadata {
  generatedAt: string;
  timezone: string;
  environment: string;
}

interface MlbTeamSummary {
  name: string;
  score: number | null;
}

interface MlbGameSummary {
  gameId: number;
  status: string;
  startTime: string;
  venue: string | null;
  teams: {
    away: MlbTeamSummary;
    home: MlbTeamSummary;
  };
}

interface MlbScoreboardResponse {
  date: string;
  games: MlbGameSummary[];
  sources: SourceCitation[];
  metadata: ApiMetadata;
}

interface MlbAggregate {
  totalGames: number;
  finals: number;
  inProgress: number;
}

const DEFAULT_TIMEZONE = 'America/Chicago';

function chicagoTimestamp(date = new Date(), timezone = DEFAULT_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  const yyyy = lookup.get('year') ?? '0000';
  const mm = lookup.get('month') ?? '00';
  const dd = lookup.get('day') ?? '00';
  const hh = lookup.get('hour') ?? '00';
  const min = lookup.get('minute') ?? '00';
  const ss = lookup.get('second') ?? '00';
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

function parseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function normalizeDate(input: string | null, timezone: string): string {
  if (input) {
    const match = /^\d{4}-\d{2}-\d{2}$/.exec(input);
    if (match) return input;
  }
  const now = chicagoTimestamp(new Date(), timezone).slice(0, 10);
  return now;
}

function summarizeMlbSchedule(payload: any): MlbGameSummary[] {
  const dates = Array.isArray(payload?.dates) ? payload.dates : [];
  const games = dates.flatMap((date: any) => (Array.isArray(date?.games) ? date.games : []));
  return games.map((game: any) => ({
    gameId: Number(game?.gamePk ?? 0),
    status: String(game?.status?.detailedState ?? 'Unknown'),
    startTime: String(game?.gameDate ?? ''),
    venue: game?.venue?.name ? String(game.venue.name) : null,
    teams: {
      away: {
        name: String(game?.teams?.away?.team?.name ?? 'Away'),
        score: parseScore(game?.teams?.away?.score),
      },
      home: {
        name: String(game?.teams?.home?.team?.name ?? 'Home'),
        score: parseScore(game?.teams?.home?.score),
      },
    },
  }));
}

function summarizeMlbAggregate(games: MlbGameSummary[]): MlbAggregate {
  const totalGames = games.length;
  const finals = games.filter((game) => /final/i.test(game.status)).length;
  const inProgress = games.filter((game) => /in progress|live|warmup/i.test(game.status)).length;
  return { totalGames, finals, inProgress };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

async function cacheGet<T>(namespace: KVNamespace, key: string): Promise<T | null> {
  const cached = await namespace.get(key);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as T;
  } catch {
    return null;
  }
}

async function cachePut(namespace: KVNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await namespace.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

async function handleMlbScoreboard(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const timezone = env.TIMEZONE || DEFAULT_TIMEZONE;
  const date = normalizeDate(url.searchParams.get('date'), timezone);
  const cacheKey = `mlb:scoreboard:${date}`;
  const ttlSeconds = Number.parseInt(env.CACHE_TTL_SECONDS || '60', 10);

  const cached = await cacheGet<MlbScoreboardResponse>(env.BLAZECRAFT_CACHE, cacheKey);
  if (cached) {
    return jsonResponse(cached);
  }

  const base = env.MLB_STATS_API_BASE;
  if (!base) {
    return jsonResponse({
      date,
      games: [],
      sources: [],
      metadata: {
        generatedAt: chicagoTimestamp(new Date(), timezone),
        timezone,
        environment: env.ENVIRONMENT ?? 'production',
      },
    } satisfies MlbScoreboardResponse);
  }

  const endpoint = `${base}/schedule?sportId=1&date=${date}`;
  const upstream = await fetch(endpoint, {
    headers: {
      'user-agent': 'blazecraft-worker/1.0',
    },
  });

  if (!upstream.ok) {
    return errorResponse(`MLB upstream unavailable (${upstream.status}).`, 502);
  }

  const payload = await upstream.json();
  const games = summarizeMlbSchedule(payload);
  const response: MlbScoreboardResponse = {
    date,
    games,
    sources: [
      {
        name: 'MLB Stats API',
        url: endpoint,
        confidence: 0.95,
      },
    ],
    metadata: {
      generatedAt: chicagoTimestamp(new Date(), timezone),
      timezone,
      environment: env.ENVIRONMENT ?? 'production',
    },
  };

  const aggregate = summarizeMlbAggregate(games);
  const aggregatePayload = {
    sport: 'mlb',
    date,
    aggregate,
    sources: response.sources,
    metadata: response.metadata,
  };

  ctx.waitUntil(cachePut(env.BLAZECRAFT_CACHE, cacheKey, response, ttlSeconds));
  ctx.waitUntil(
    env.HISTORICAL_BUCKET.put(`mlb/scoreboard/${date}.json`, JSON.stringify(payload), {
      httpMetadata: { contentType: 'application/json' },
    }),
  );
  ctx.waitUntil(upsertAggregate(env.HISTORICAL_DB, 'mlb', date, aggregatePayload));

  return jsonResponse(response);
}

async function upsertAggregate(db: D1Database, sport: string, date: string, payload: unknown): Promise<void> {
  const now = chicagoTimestamp();
  await db
    .prepare(
      `INSERT INTO aggregates (sport, aggregate_date, payload, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(sport, aggregate_date)
       DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .bind(sport, date, JSON.stringify(payload), now)
    .run();
}

async function handleAggregate(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sport = url.pathname.split('/').pop() || '';
  const timezone = env.TIMEZONE || DEFAULT_TIMEZONE;
  const date = normalizeDate(url.searchParams.get('date'), timezone);
  const row = await env.HISTORICAL_DB.prepare(
    `SELECT payload FROM aggregates WHERE sport = ? AND aggregate_date = ? LIMIT 1`,
  )
    .bind(sport, date)
    .first<{ payload: string }>();

  if (!row?.payload) {
    return jsonResponse({
      sport,
      date,
      aggregate: null,
      sources: [],
      metadata: {
        generatedAt: chicagoTimestamp(new Date(), timezone),
        timezone,
        environment: env.ENVIRONMENT ?? 'production',
      },
    });
  }

  return jsonResponse(JSON.parse(row.payload));
}

function routeRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    return Promise.resolve(
      jsonResponse({
        status: 'ok',
        metadata: {
          generatedAt: chicagoTimestamp(new Date(), env.TIMEZONE || DEFAULT_TIMEZONE),
          timezone: env.TIMEZONE || DEFAULT_TIMEZONE,
          environment: env.ENVIRONMENT ?? 'production',
        },
      }),
    );
  }

  if (url.pathname === '/api/mlb/scoreboard') {
    return handleMlbScoreboard(request, env, ctx);
  }

  if (url.pathname.startsWith('/api/aggregates/')) {
    return handleAggregate(request, env);
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return Promise.resolve(errorResponse('Not found.', 404));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed.', 405);
    }
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      return errorResponse(message, 500);
    }
  },
};

export {
  chicagoTimestamp,
  normalizeDate,
  summarizeMlbSchedule,
  summarizeMlbAggregate,
};
