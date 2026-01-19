export interface Env {
  ENVIRONMENT: string;
  TIMEZONE: string;
  ASSETS: Fetcher;
}

type League = 'MLB' | 'NCAA_BASEBALL' | 'NCAA_FOOTBALL' | 'NFL' | 'NBA';

type EventStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'canceled' | 'unknown';

interface ConfidenceInterval {
  value: number;
  interval: [number, number];
}

interface EventSource {
  url: string;
  retrievedAt: string;
  confidence: ConfidenceInterval;
}

interface TeamInfo {
  name: string;
  abbreviation: string | null;
  score: number | null;
}

interface NormalizedEvent {
  id: string;
  league: League;
  startTime: string;
  status: EventStatus;
  home: TeamInfo;
  away: TeamInfo;
  venue: string | null;
  updatedAt: string;
  sources: EventSource[];
}

interface ApiResponse {
  generatedAt: string;
  timezone: string;
  events: NormalizedEvent[];
  warnings: string[];
}

const MLB_ENDPOINT = 'https://statsapi.mlb.com/api/v1/schedule';
const NCAA_BASEBALL_ENDPOINT = 'https://data.ncaa.com/casablanca/scoreboard/baseball/d1';
const NCAA_FOOTBALL_ENDPOINT = 'https://data.ncaa.com/casablanca/scoreboard/football/fbs';
const NBA_ENDPOINT = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const NFL_SCORESTRIP_ENDPOINT = 'https://api.nfl.com/scorestrip/ss.xml';
const NFL_FEEDS_ENDPOINT = 'https://feeds.nfl.com/feeds-rs/scores.json';

const DEFAULT_TIMEZONE = 'America/Chicago';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    return jsonResponse({ status: 'ok' }, 200);
  }

  if (url.pathname === '/api/events') {
    const timezone = env.TIMEZONE || DEFAULT_TIMEZONE;
    const generatedAt = formatChicagoDateTime(new Date(), timezone);
    const warnings: string[] = [];

    const [mlb, ncaaBaseball, ncaaFootball, nfl, nba] = await Promise.all([
      fetchMlb(timezone).catch((err) => {
        warnings.push(`MLB fetch failed: ${stringifyError(err)}`);
        return [] as NormalizedEvent[];
      }),
      fetchNcaa(NCAA_BASEBALL_ENDPOINT, 'NCAA_BASEBALL', timezone).catch((err) => {
        warnings.push(`NCAA baseball fetch failed: ${stringifyError(err)}`);
        return [] as NormalizedEvent[];
      }),
      fetchNcaa(NCAA_FOOTBALL_ENDPOINT, 'NCAA_FOOTBALL', timezone).catch((err) => {
        warnings.push(`NCAA football fetch failed: ${stringifyError(err)}`);
        return [] as NormalizedEvent[];
      }),
      fetchNfl(timezone).catch((err) => {
        warnings.push(`NFL fetch failed: ${stringifyError(err)}`);
        return [] as NormalizedEvent[];
      }),
      fetchNba(timezone).catch((err) => {
        warnings.push(`NBA fetch failed: ${stringifyError(err)}`);
        return [] as NormalizedEvent[];
      }),
    ]);

    const events = [
      ...mlb,
      ...ncaaBaseball,
      ...ncaaFootball,
      ...nfl,
      ...nba,
    ];

    const body: ApiResponse = {
      generatedAt,
      timezone,
      events,
      warnings,
    };

    return jsonResponse(body, 200, {
      'Cache-Control': 'max-age=30, s-maxage=30',
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatChicagoDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

function formatChicagoDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function formatChicagoPathDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}/${lookup.month}/${lookup.day}`;
}

function buildSource(url: string, retrievedAt: Date, timeZone: string): EventSource {
  return {
    url,
    retrievedAt: formatChicagoDateTime(retrievedAt, timeZone),
    confidence: {
      value: 0.9,
      interval: [0.85, 0.95],
    },
  };
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status}`);
    }
    return await res.json<T>();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/xml,text/xml,text/html,*/*' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${url} returned ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMlb(timeZone: string): Promise<NormalizedEvent[]> {
  const now = new Date();
  const date = formatChicagoDate(now, timeZone);
  const url = `${MLB_ENDPOINT}?sportId=1&hydrate=team,linescore,venue&date=${date}`;
  const data = await fetchJson<any>(url);
  const retrievedAt = new Date();
  const source = buildSource(url, retrievedAt, timeZone);
  const games = data?.dates?.[0]?.games ?? [];

  const events: NormalizedEvent[] = [];
  for (const game of games) {
    const id = String(game?.gamePk ?? '');
    const gameDate = game?.gameDate ? new Date(game.gameDate) : null;
    const startTime = gameDate ? formatChicagoDateTime(gameDate, timeZone) : null;
    const homeTeam = game?.teams?.home?.team?.name;
    const awayTeam = game?.teams?.away?.team?.name;
    if (!id || !startTime || !homeTeam || !awayTeam) continue;

    const status = mapMlbStatus(game?.status?.detailedState ?? game?.status?.abstractGameState);
    const event: NormalizedEvent = {
      id,
      league: 'MLB',
      startTime,
      status,
      home: {
        name: homeTeam,
        abbreviation: game?.teams?.home?.team?.abbreviation ?? null,
        score: numberOrNull(game?.teams?.home?.score),
      },
      away: {
        name: awayTeam,
        abbreviation: game?.teams?.away?.team?.abbreviation ?? null,
        score: numberOrNull(game?.teams?.away?.score),
      },
      venue: game?.venue?.name ?? null,
      updatedAt: formatChicagoDateTime(retrievedAt, timeZone),
      sources: [source],
    };
    events.push(event);
  }
  return events;
}

function mapMlbStatus(value?: string): EventStatus {
  if (!value) return 'unknown';
  const normalized = value.toLowerCase();
  if (normalized.includes('final') || normalized.includes('game over')) return 'final';
  if (normalized.includes('in progress') || normalized.includes('live')) return 'live';
  if (normalized.includes('postponed')) return 'postponed';
  if (normalized.includes('suspended') || normalized.includes('delayed')) return 'postponed';
  if (normalized.includes('cancel')) return 'canceled';
  if (normalized.includes('scheduled') || normalized.includes('pre-game')) return 'scheduled';
  return 'unknown';
}

async function fetchNcaa(endpoint: string, league: League, timeZone: string): Promise<NormalizedEvent[]> {
  const now = new Date();
  const pathDate = formatChicagoPathDate(now, timeZone);
  const url = `${endpoint}/${pathDate}/scoreboard.json`;
  const data = await fetchJson<any>(url);
  const retrievedAt = new Date();
  const source = buildSource(url, retrievedAt, timeZone);

  const games = data?.games ?? [];
  const events: NormalizedEvent[] = [];
  for (const item of games) {
    const game = item?.game ?? item;
    const id = String(game?.gameID ?? game?.gameId ?? game?.id ?? '');
    const startDate = parseNcaaStart(game, data?.gameDate);
    const startTime = startDate ? formatChicagoDateTime(startDate, timeZone) : null;
    const homeTeam = extractNcaaTeamName(game?.home);
    const awayTeam = extractNcaaTeamName(game?.away);
    if (!id || !startTime || !homeTeam || !awayTeam) continue;

    const status = mapNcaaStatus(game);
    const event: NormalizedEvent = {
      id,
      league,
      startTime,
      status,
      home: {
        name: homeTeam,
        abbreviation: extractNcaaTeamAbbr(game?.home),
        score: numberOrNull(game?.home?.score),
      },
      away: {
        name: awayTeam,
        abbreviation: extractNcaaTeamAbbr(game?.away),
        score: numberOrNull(game?.away?.score),
      },
      venue: game?.venue?.name ?? game?.venue ?? null,
      updatedAt: formatChicagoDateTime(retrievedAt, timeZone),
      sources: [source],
    };
    events.push(event);
  }
  return events;
}

function extractNcaaTeamName(team: any): string | null {
  if (!team) return null;
  return team?.names?.short ?? team?.names?.char6 ?? team?.name ?? team?.short ?? null;
}

function extractNcaaTeamAbbr(team: any): string | null {
  if (!team) return null;
  return team?.names?.char6 ?? team?.abbr ?? team?.abbreviation ?? null;
}

function parseNcaaStart(game: any, fallbackDate?: string): Date | null {
  const epoch = game?.startTimeEpoch ?? game?.startTimeEpochMs ?? game?.startTimeEpochSeconds;
  if (typeof epoch === 'number') {
    const ms = epoch > 1e12 ? epoch : epoch * 1000;
    return new Date(ms);
  }

  const candidate = game?.startTime ?? game?.startDate ?? game?.gameTimeUtc ?? game?.gameDateTime;
  if (typeof candidate === 'string') {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime()) && hasTimezone(candidate)) {
      return parsed;
    }
  }

  if (fallbackDate && typeof game?.gameTime === 'string' && hasTimeZoneHint(game.gameTime)) {
    const combined = `${fallbackDate}T${game.gameTime}`;
    const parsed = new Date(combined);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function hasTimezone(value: string): boolean {
  return /z$|[+-]\d{2}:?\d{2}$/i.test(value);
}

function hasTimeZoneHint(value: string): boolean {
  return /ET|CT|MT|PT|Z|UTC/i.test(value);
}

function mapNcaaStatus(game: any): EventStatus {
  const raw = `${game?.gameState ?? game?.gameStatus ?? game?.status ?? ''}`.toLowerCase();
  if (raw.includes('final')) return 'final';
  if (raw.includes('live') || raw.includes('in progress')) return 'live';
  if (raw.includes('postponed')) return 'postponed';
  if (raw.includes('cancel')) return 'canceled';
  if (raw.includes('sched') || raw.includes('preview')) return 'scheduled';
  return 'unknown';
}

async function fetchNba(timeZone: string): Promise<NormalizedEvent[]> {
  const url = NBA_ENDPOINT;
  const data = await fetchJson<any>(url);
  const retrievedAt = new Date();
  const source = buildSource(url, retrievedAt, timeZone);
  const games = data?.scoreboard?.games ?? [];
  const events: NormalizedEvent[] = [];
  for (const game of games) {
    const id = String(game?.gameId ?? '');
    const startDate = game?.gameTimeUTC ? new Date(game.gameTimeUTC) : null;
    const startTime = startDate ? formatChicagoDateTime(startDate, timeZone) : null;
    const homeTeam = game?.homeTeam?.teamName ? `${game.homeTeam.teamCity} ${game.homeTeam.teamName}` : null;
    const awayTeam = game?.awayTeam?.teamName ? `${game.awayTeam.teamCity} ${game.awayTeam.teamName}` : null;
    if (!id || !startTime || !homeTeam || !awayTeam) continue;

    const status = mapNbaStatus(game?.gameStatus);
    const event: NormalizedEvent = {
      id,
      league: 'NBA',
      startTime,
      status,
      home: {
        name: homeTeam,
        abbreviation: game?.homeTeam?.teamTricode ?? null,
        score: numberOrNull(game?.homeTeam?.score),
      },
      away: {
        name: awayTeam,
        abbreviation: game?.awayTeam?.teamTricode ?? null,
        score: numberOrNull(game?.awayTeam?.score),
      },
      venue: game?.arena?.arenaName ?? null,
      updatedAt: formatChicagoDateTime(retrievedAt, timeZone),
      sources: [source],
    };
    events.push(event);
  }
  return events;
}

function mapNbaStatus(gameStatus: number | string | undefined): EventStatus {
  if (typeof gameStatus === 'number') {
    if (gameStatus === 1) return 'scheduled';
    if (gameStatus === 2) return 'live';
    if (gameStatus === 3) return 'final';
  }
  if (typeof gameStatus === 'string') {
    const normalized = gameStatus.toLowerCase();
    if (normalized.includes('final')) return 'final';
    if (normalized.includes('live') || normalized.includes('in progress')) return 'live';
    if (normalized.includes('sched')) return 'scheduled';
  }
  return 'unknown';
}

async function fetchNfl(timeZone: string): Promise<NormalizedEvent[]> {
  const errors: string[] = [];
  try {
    const xml = await fetchText(NFL_SCORESTRIP_ENDPOINT);
    return normalizeNflScorestrip(xml, NFL_SCORESTRIP_ENDPOINT, timeZone);
  } catch (err) {
    errors.push(stringifyError(err));
  }

  try {
    const json = await fetchJson<any>(NFL_FEEDS_ENDPOINT);
    return normalizeNflFeeds(json, NFL_FEEDS_ENDPOINT, timeZone);
  } catch (err) {
    errors.push(stringifyError(err));
  }

  if (errors.length) {
    throw new Error(errors.join(' | '));
  }

  return [];
}

function normalizeNflScorestrip(xml: string, sourceUrl: string, timeZone: string): NormalizedEvent[] {
  const retrievedAt = new Date();
  const source = buildSource(sourceUrl, retrievedAt, timeZone);
  const events: NormalizedEvent[] = [];
  const gameRegex = /<g\s+([^>]+?)\s*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = gameRegex.exec(xml))) {
    const attrs = parseXmlAttributes(match[1]);
    const id = attrs.eid ?? '';
    const homeTeam = attrs.hn ?? attrs.ht ?? '';
    const awayTeam = attrs.an ?? attrs.at ?? '';
    if (!id || !homeTeam || !awayTeam) continue;

    const startDate = parseNflDate(attrs.eid, attrs.t);
    if (!startDate) continue;

    const status = mapNflStatus(attrs.q);
    const event: NormalizedEvent = {
      id,
      league: 'NFL',
      startTime: formatChicagoDateTime(startDate, timeZone),
      status,
      home: {
        name: homeTeam,
        abbreviation: attrs.ht ?? null,
        score: numberOrNull(attrs.hs),
      },
      away: {
        name: awayTeam,
        abbreviation: attrs.at ?? null,
        score: numberOrNull(attrs.as),
      },
      venue: attrs.st ?? null,
      updatedAt: formatChicagoDateTime(retrievedAt, timeZone),
      sources: [source],
    };
    events.push(event);
  }
  return events;
}

function normalizeNflFeeds(data: any, sourceUrl: string, timeZone: string): NormalizedEvent[] {
  const retrievedAt = new Date();
  const source = buildSource(sourceUrl, retrievedAt, timeZone);
  const games = data?.gameScores ?? data?.games ?? [];
  const events: NormalizedEvent[] = [];
  for (const game of games) {
    const id = String(game?.gameId ?? game?.game_id ?? '');
    const start = game?.gameTime ? new Date(game.gameTime) : null;
    const startTime = start && !Number.isNaN(start.getTime()) ? formatChicagoDateTime(start, timeZone) : null;
    const homeTeam = game?.homeTeam?.nick ?? game?.homeTeam?.name ?? game?.home?.name;
    const awayTeam = game?.awayTeam?.nick ?? game?.awayTeam?.name ?? game?.away?.name;
    if (!id || !startTime || !homeTeam || !awayTeam) continue;

    const status = mapNflStatus(game?.status ?? game?.gameStatus);
    const event: NormalizedEvent = {
      id,
      league: 'NFL',
      startTime,
      status,
      home: {
        name: homeTeam,
        abbreviation: game?.homeTeam?.abbr ?? game?.home?.abbr ?? null,
        score: numberOrNull(game?.homeTeam?.score ?? game?.home?.score),
      },
      away: {
        name: awayTeam,
        abbreviation: game?.awayTeam?.abbr ?? game?.away?.abbr ?? null,
        score: numberOrNull(game?.awayTeam?.score ?? game?.away?.score),
      },
      venue: game?.venue ?? null,
      updatedAt: formatChicagoDateTime(retrievedAt, timeZone),
      sources: [source],
    };
    events.push(event);
  }
  return events;
}

function parseXmlAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(value))) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseNflDate(eid?: string, time?: string): Date | null {
  if (!eid || eid.length < 8) return null;
  const year = Number(eid.slice(0, 4));
  const month = Number(eid.slice(4, 6)) - 1;
  const day = Number(eid.slice(6, 8));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (!time) return new Date(Date.UTC(year, month, day, 0, 0, 0));

  const timeMatch = time.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return new Date(Date.UTC(year, month, day, 0, 0, 0));
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  return new Date(Date.UTC(year, month, day, hour, minute, 0));
}

function mapNflStatus(value?: string): EventStatus {
  if (!value) return 'unknown';
  const normalized = String(value).toLowerCase();
  if (normalized.includes('final')) return 'final';
  if (normalized.includes('in') || normalized.includes('live')) return 'live';
  if (normalized.includes('post')) return 'postponed';
  if (normalized.includes('cancel')) return 'canceled';
  if (normalized.includes('pre') || normalized.includes('sched')) return 'scheduled';
  return 'unknown';
}

function numberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}
