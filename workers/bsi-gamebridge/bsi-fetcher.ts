/**
 * BSI Fetcher - Fetches live sports data from Highlightly API
 *
 * Transforms raw API responses into GameSnapshot format for delta detection.
 */

import type {
  Env,
  GameSnapshot,
  LiveGameState,
  LeagueStandings,
  League,
  EventSource,
} from './types';

const HIGHLIGHTLY_BASE_URL = 'https://api.highlightly.io/v1';

interface HighlightlyGame {
  id: string;
  home_team: {
    id: string;
    name: string;
    abbreviation: string;
    score: number;
    record?: string;
  };
  away_team: {
    id: string;
    name: string;
    abbreviation: string;
    score: number;
    record?: string;
  };
  status: 'scheduled' | 'in_progress' | 'final' | 'delayed' | 'postponed';
  start_time: string;
  league: string;
}

interface HighlightlyResponse {
  games: HighlightlyGame[];
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

function normalizeStatus(status: string): 'scheduled' | 'live' | 'final' {
  if (status === 'in_progress') return 'live';
  if (status === 'final') return 'final';
  return 'scheduled';
}

function normalizeLeague(league: string): League {
  const lower = league.toLowerCase();
  if (lower === 'mlb' || lower === 'nfl' || lower === 'ncaaf' || lower === 'nba' || lower === 'nhl') {
    return lower as League;
  }
  return 'mlb';
}

async function fetchLiveGames(env: Env, league: League): Promise<LiveGameState[]> {
  if (!env.BSI_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${HIGHLIGHTLY_BASE_URL}/sports/${league}/games/live`, {
      headers: {
        'Authorization': `Bearer ${env.BSI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Highlightly API error for ${league}: ${response.status}`);
      return [];
    }

    const data = await response.json() as HighlightlyResponse;

    return (data.games || []).map((game): LiveGameState => ({
      gameId: game.id,
      league: normalizeLeague(game.league),
      homeTeam: {
        id: game.home_team.id,
        name: game.home_team.name,
        abbreviation: game.home_team.abbreviation,
        score: game.home_team.score,
        record: game.home_team.record,
      },
      awayTeam: {
        id: game.away_team.id,
        name: game.away_team.name,
        abbreviation: game.away_team.abbreviation,
        score: game.away_team.score,
        record: game.away_team.record,
      },
      status: normalizeStatus(game.status),
      startTime: game.start_time,
    }));
  } catch (err) {
    console.error(`Failed to fetch ${league} games:`, err);
    return [];
  }
}

/**
 * Fetch current snapshot from Highlightly API with fallback to empty snapshot.
 */
export async function getSnapshotWithFallback(env: Env): Promise<GameSnapshot> {
  const leagues: League[] = ['mlb', 'nfl', 'ncaaf'];
  const allGames: LiveGameState[] = [];

  // Fetch all leagues in parallel
  const results = await Promise.all(
    leagues.map((league) => fetchLiveGames(env, league))
  );

  for (const games of results) {
    allGames.push(...games);
  }

  const snapshot: GameSnapshot = {
    liveGames: allGames,
    standings: [],
    lastUpdated: getChicagoTimestamp(),
    source: 'bsi' as EventSource,
  };

  return snapshot;
}
