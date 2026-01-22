/**
 * BlazeCraft GameBridge Event Types
 *
 * Defines the contract between BSI sports data and BlazeCraft game events.
 * Events transform real sports signals into RTS gameplay pressure and opportunity windows.
 */

/** Event priority levels */
export type EventPriority = 1 | 2 | 3;

/** Event types mapped to BlazeCraft's building categories */
export type BlazeCraftEventType =
  | 'WORLD_TICK'           // Heartbeat (30s), drives idle checks
  | 'GAME_START'           // Game begins -> spawn opportunity
  | 'GAME_UPDATE'          // Score change -> resource generation
  | 'GAME_FINAL'           // Game ends -> major reward/penalty
  | 'STANDINGS_DELTA'      // Ranking shift -> territory pressure
  | 'LINEUP_POSTED'        // Premium: lineup revealed -> scouting window
  | 'ODDS_SHIFT'           // Premium: betting line move -> market event
  | 'HIGHLIGHT_CLIP'       // Premium: big play -> morale surge
  | 'INJURY_ALERT'         // Player injured -> crisis event
  | 'MOMENTUM_SWING'       // Premium: win probability shift -> buff/debuff
  | 'OPS_HEARTBEAT'        // Ops: system healthy
  | 'OPS_DEGRADED'         // Ops: service degraded
  | 'OPS_RECOVERED';       // Ops: service recovered

/** Event source indicator */
export type EventSource = 'bsi' | 'sim' | 'ops';

/** Subscription tier for event gating */
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/** Client mode for event verbosity */
export type ClientMode = 'spectator' | 'manager' | 'commander';

/** Supported leagues */
export type League = 'mlb' | 'nfl' | 'ncaaf' | 'nba' | 'nhl';

/** Game context for sports-specific data */
export interface GameContext {
  gameId: string;
  league: League;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  status: 'scheduled' | 'live' | 'final' | 'delayed' | 'postponed';
  inning?: number;    // MLB
  quarter?: number;   // NFL/NBA
  period?: number;    // NHL
  timeRemaining?: string;
  venue?: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  abbreviation: string;
  score: number;
  record?: string;
}

/** Base event structure */
export interface BlazeCraftEvent {
  id: string;
  type: BlazeCraftEventType;
  timestamp: string;  // ISO 8601, America/Chicago
  source: EventSource;
  priority: EventPriority;
  payload: EventPayload;
  gameContext?: GameContext;
}

/** Payload type union */
export type EventPayload =
  | WorldTickPayload
  | GameEventPayload
  | StandingsPayload
  | LineupPayload
  | OddsPayload
  | HighlightPayload
  | InjuryPayload
  | MomentumPayload
  | OpsHealthPayload;

/** WORLD_TICK payload */
export interface WorldTickPayload {
  type: 'WORLD_TICK';
  liveGames: number;
  nextGameIn?: number;  // seconds until next game
  serverTime: string;
}

/** GAME_START, GAME_UPDATE, GAME_FINAL payloads */
export interface GameEventPayload {
  type: 'GAME_START' | 'GAME_UPDATE' | 'GAME_FINAL';
  gameId: string;
  league: League;
  homeScore: number;
  awayScore: number;
  scoringPlay?: string;
  winProbability?: number;  // 0-100 for home team
}

/** STANDINGS_DELTA payload */
export interface StandingsPayload {
  type: 'STANDINGS_DELTA';
  league: League;
  teamId: string;
  previousRank: number;
  newRank: number;
  delta: number;  // positive = climbed, negative = dropped
}

/** LINEUP_POSTED payload (Premium) */
export interface LineupPayload {
  type: 'LINEUP_POSTED';
  gameId: string;
  league: League;
  team: string;
  players: string[];
  notableChanges?: string[];
}

/** ODDS_SHIFT payload (Premium) */
export interface OddsPayload {
  type: 'ODDS_SHIFT';
  gameId: string;
  league: League;
  previousLine: number;
  newLine: number;
  movement: 'sharp' | 'gradual';
  direction: 'home' | 'away';
}

/** HIGHLIGHT_CLIP payload (Premium) */
export interface HighlightPayload {
  type: 'HIGHLIGHT_CLIP';
  gameId: string;
  league: League;
  description: string;
  playType: 'homerun' | 'touchdown' | 'goal' | 'dunk' | 'strikeout' | 'interception' | 'other';
  clipUrl?: string;
}

/** INJURY_ALERT payload */
export interface InjuryPayload {
  type: 'INJURY_ALERT';
  league: League;
  playerId: string;
  playerName: string;
  team: string;
  severity: 'minor' | 'moderate' | 'severe' | 'unknown';
  description?: string;
}

/** MOMENTUM_SWING payload (Premium) */
export interface MomentumPayload {
  type: 'MOMENTUM_SWING';
  gameId: string;
  league: League;
  previousWinProb: number;
  newWinProb: number;
  swingMagnitude: number;  // absolute change
  favoredTeam: 'home' | 'away';
}

/** OPS_HEARTBEAT, OPS_DEGRADED, OPS_RECOVERED payloads */
export type OpsService = 'admin' | 'vitals' | 'semantic';
export type OpsStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface OpsHealthPayload {
  type: 'OPS_HEARTBEAT' | 'OPS_DEGRADED' | 'OPS_RECOVERED';
  service: OpsService;
  status: OpsStatus;
  previousStatus?: OpsStatus;
  responseTime?: number;
  warnings?: string[];
}

/** Event->Game resource mapping */
export interface ResourceEffect {
  gold?: number;
  intel?: number;
  influence?: number;
  morale?: number;
  workerSlots?: number;
}

/** Building category mapping */
export type BuildingCategory =
  | 'townhall'
  | 'production'
  | 'command'
  | 'defense'
  | 'research'
  | 'storage'
  | 'repairs'
  | 'tower';

/** Event to game mapping result */
export interface EventGameMapping {
  buildingCategory: BuildingCategory;
  resourceEffect: ResourceEffect;
  duration?: number;  // buff/debuff duration in seconds
  crisisTask?: string;  // for INJURY_ALERT
}

/** KV snapshot structure */
export interface GameSnapshot {
  liveGames: LiveGameState[];
  standings: LeagueStandings[];
  lastUpdated: string;
  source: EventSource;
}

export interface LiveGameState {
  gameId: string;
  league: League;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  status: 'scheduled' | 'live' | 'final';
  startTime: string;
  lastScoreUpdate?: string;
}

export interface LeagueStandings {
  league: League;
  division?: string;
  teams: StandingEntry[];
  lastUpdated: string;
}

export interface StandingEntry {
  teamId: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  winPct: number;
  gamesBack?: number;
}

/** Worker environment bindings */
export interface Env {
  BSI_GAMEBRIDGE_SNAPSHOT: KVNamespace;
  BSI_GAMEBRIDGE_DELTAS: KVNamespace;
  BSI_OPS_DELTAS?: KVNamespace;
  BSI_TICKER_URL?: string;
  BSI_API_KEY?: string;
  ENVIRONMENT?: 'development' | 'production';
}

/** SSE connection state */
export interface SSEClient {
  id: string;
  mode: ClientMode;
  tier: SubscriptionTier;
  leagues: League[];
  teams: string[];
  connectedAt: number;
}

/** Rate limit tracking */
export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Cache TTL constants (in seconds) */
export const CACHE_TTL = {
  /** TTL for live game data (30 seconds) */
  LIVE: 30,
  /** TTL for final game data (5 minutes) */
  FINAL: 300,
  /** TTL for standings data (5 minutes) */
  STANDINGS: 300,
  /** TTL for delta events (5 minutes) */
  DELTAS: 300,
} as const;

/** Polling intervals (in milliseconds) */
export const POLL_INTERVAL = {
  /** SSE client poll interval (5 seconds) */
  SSE_CLIENT: 5000,
  /** World tick interval (30 seconds) */
  WORLD_TICK: 30000,
  /** Cron poll interval (60 seconds) */
  CRON: 60000,
} as const;
