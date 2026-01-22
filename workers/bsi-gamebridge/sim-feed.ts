/**
 * SimFeed - Simulation feed for demo mode
 *
 * Generates realistic fake sports events for testing and demo purposes
 * when BSI_API_KEY is not configured.
 */

import type {
  BlazeCraftEvent,
  BlazeCraftEventType,
  League,
  GameEventPayload,
  InjuryPayload,
  EventSource,
} from './types';

const DEMO_TEAMS: Record<League, Array<{ id: string; name: string; abbreviation: string }>> = {
  mlb: [
    { id: 'tex', name: 'Rangers', abbreviation: 'TEX' },
    { id: 'hou', name: 'Astros', abbreviation: 'HOU' },
    { id: 'nyy', name: 'Yankees', abbreviation: 'NYY' },
    { id: 'bos', name: 'Red Sox', abbreviation: 'BOS' },
  ],
  nfl: [
    { id: 'dal', name: 'Cowboys', abbreviation: 'DAL' },
    { id: 'phi', name: 'Eagles', abbreviation: 'PHI' },
    { id: 'sf', name: '49ers', abbreviation: 'SF' },
    { id: 'kc', name: 'Chiefs', abbreviation: 'KC' },
  ],
  ncaaf: [
    { id: 'tex', name: 'Longhorns', abbreviation: 'TEX' },
    { id: 'okla', name: 'Sooners', abbreviation: 'OU' },
    { id: 'osu', name: 'Buckeyes', abbreviation: 'OSU' },
    { id: 'mich', name: 'Wolverines', abbreviation: 'MICH' },
  ],
  nba: [
    { id: 'dal', name: 'Mavericks', abbreviation: 'DAL' },
    { id: 'lal', name: 'Lakers', abbreviation: 'LAL' },
  ],
  nhl: [
    { id: 'dal', name: 'Stars', abbreviation: 'DAL' },
    { id: 'col', name: 'Avalanche', abbreviation: 'COL' },
  ],
};

interface SimGame {
  gameId: string;
  league: League;
  homeTeam: typeof DEMO_TEAMS['mlb'][0];
  awayTeam: typeof DEMO_TEAMS['mlb'][0];
  homeScore: number;
  awayScore: number;
  status: 'scheduled' | 'live' | 'final';
  inning: number;
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

export class SimFeed {
  private games: SimGame[];
  private tickCount = 0;

  constructor() {
    this.games = this.initializeGames();
  }

  private initializeGames(): SimGame[] {
    const mlbTeams = DEMO_TEAMS.mlb;
    return [
      {
        gameId: 'sim-mlb-1',
        league: 'mlb' as League,
        homeTeam: mlbTeams[0],
        awayTeam: mlbTeams[1],
        homeScore: 2,
        awayScore: 3,
        status: 'live',
        inning: 5,
      },
      {
        gameId: 'sim-mlb-2',
        league: 'mlb' as League,
        homeTeam: mlbTeams[2],
        awayTeam: mlbTeams[3],
        homeScore: 0,
        awayScore: 1,
        status: 'live',
        inning: 3,
      },
    ];
  }

  getLiveGameCount(): number {
    return this.games.filter((g) => g.status === 'live').length;
  }

  tick(): BlazeCraftEvent[] {
    this.tickCount++;
    const events: BlazeCraftEvent[] = [];

    // Every 3rd tick, simulate a score update on a random live game
    if (this.tickCount % 3 === 0) {
      const liveGames = this.games.filter((g) => g.status === 'live');
      if (liveGames.length > 0) {
        const game = liveGames[Math.floor(Math.random() * liveGames.length)];
        const isHomeScore = Math.random() > 0.5;

        if (isHomeScore) {
          game.homeScore++;
        } else {
          game.awayScore++;
        }

        const payload: GameEventPayload = {
          type: 'GAME_UPDATE',
          gameId: game.gameId,
          league: game.league,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          scoringPlay: isHomeScore ? `${game.homeTeam.name} scored` : `${game.awayTeam.name} scored`,
        };

        events.push({
          id: generateEventId(),
          type: 'GAME_UPDATE',
          timestamp: getChicagoTimestamp(),
          source: 'sim' as EventSource,
          priority: 2,
          payload,
          gameContext: {
            gameId: game.gameId,
            league: game.league,
            homeTeam: { ...game.homeTeam, score: game.homeScore, record: '50-30' },
            awayTeam: { ...game.awayTeam, score: game.awayScore, record: '48-32' },
            status: 'live',
            inning: game.inning,
          },
        });
      }
    }

    // Every 10th tick, simulate an injury alert
    if (this.tickCount % 10 === 0) {
      const players = ['Mike Trout', 'Aaron Judge', 'Corey Seager', 'Jose Altuve'];
      const severities: Array<'minor' | 'moderate' | 'severe'> = ['minor', 'moderate', 'severe'];

      const payload: InjuryPayload = {
        type: 'INJURY_ALERT',
        league: 'mlb',
        playerId: 'sim-player-1',
        playerName: players[Math.floor(Math.random() * players.length)],
        team: 'TEX',
        severity: severities[Math.floor(Math.random() * severities.length)],
        description: 'Removed from game with apparent injury',
      };

      events.push({
        id: generateEventId(),
        type: 'INJURY_ALERT',
        timestamp: getChicagoTimestamp(),
        source: 'sim' as EventSource,
        priority: 1,
        payload,
      });
    }

    return events;
  }
}
