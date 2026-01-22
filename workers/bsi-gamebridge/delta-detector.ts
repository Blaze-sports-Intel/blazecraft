/**
 * Delta Detector - Detects changes between game snapshots
 *
 * Compares previous and current snapshots to generate BlazeCraft events
 * for score changes, game starts, game finals, etc.
 */

import type {
  Env,
  BlazeCraftEvent,
  GameSnapshot,
  LiveGameState,
  GameEventPayload,
  EventSource,
} from './types';

const DELTA_TTL_SECONDS = 300; // 5 minutes

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

interface DeltaResult {
  events: BlazeCraftEvent[];
  updatedSnapshot: GameSnapshot;
}

class DeltaDetector {
  /**
   * Detect changes between previous and current snapshots.
   * Returns generated events and the updated snapshot for storage.
   */
  detect(previous: GameSnapshot | null, current: GameSnapshot): DeltaResult {
    const events: BlazeCraftEvent[] = [];
    const timestamp = getChicagoTimestamp();
    const source: EventSource = 'bsi';

    if (!previous) {
      // No previous snapshot - treat all live games as new
      for (const game of current.liveGames) {
        if (game.status === 'live') {
          events.push(this.createGameStartEvent(game, timestamp, source));
        }
      }
      return { events, updatedSnapshot: current };
    }

    const previousGamesMap = new Map<string, LiveGameState>();
    for (const game of previous.liveGames) {
      previousGamesMap.set(game.gameId, game);
    }

    for (const game of current.liveGames) {
      const prevGame = previousGamesMap.get(game.gameId);

      if (!prevGame) {
        // New game appeared
        if (game.status === 'live') {
          events.push(this.createGameStartEvent(game, timestamp, source));
        }
        continue;
      }

      // Check for status changes
      if (prevGame.status !== game.status) {
        if (game.status === 'live' && prevGame.status === 'scheduled') {
          events.push(this.createGameStartEvent(game, timestamp, source));
        } else if (game.status === 'final' && prevGame.status === 'live') {
          events.push(this.createGameFinalEvent(game, timestamp, source));
        }
        continue;
      }

      // Check for score changes
      if (
        game.status === 'live' &&
        (game.homeTeam.score !== prevGame.homeTeam.score ||
          game.awayTeam.score !== prevGame.awayTeam.score)
      ) {
        events.push(this.createGameUpdateEvent(game, prevGame, timestamp, source));
      }
    }

    // Check for games that ended (in previous but not in current, or status changed to final)
    for (const prevGame of previous.liveGames) {
      const currentGame = current.liveGames.find((g) => g.gameId === prevGame.gameId);
      if (!currentGame && prevGame.status === 'live') {
        // Game disappeared - assume it ended
        events.push(this.createGameFinalEvent(prevGame, timestamp, source));
      }
    }

    return { events, updatedSnapshot: current };
  }

  private createGameStartEvent(
    game: LiveGameState,
    timestamp: string,
    source: EventSource
  ): BlazeCraftEvent {
    const payload: GameEventPayload = {
      type: 'GAME_START',
      gameId: game.gameId,
      league: game.league,
      homeScore: game.homeTeam.score,
      awayScore: game.awayTeam.score,
    };

    return {
      id: generateEventId(),
      type: 'GAME_START',
      timestamp,
      source,
      priority: 2,
      payload,
      gameContext: {
        gameId: game.gameId,
        league: game.league,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        status: 'live',
      },
    };
  }

  private createGameUpdateEvent(
    game: LiveGameState,
    prevGame: LiveGameState,
    timestamp: string,
    source: EventSource
  ): BlazeCraftEvent {
    const homeScored = game.homeTeam.score > prevGame.homeTeam.score;
    const awayScored = game.awayTeam.score > prevGame.awayTeam.score;

    let scoringPlay = '';
    if (homeScored) {
      scoringPlay = `${game.homeTeam.name} scored`;
    } else if (awayScored) {
      scoringPlay = `${game.awayTeam.name} scored`;
    }

    const payload: GameEventPayload = {
      type: 'GAME_UPDATE',
      gameId: game.gameId,
      league: game.league,
      homeScore: game.homeTeam.score,
      awayScore: game.awayTeam.score,
      scoringPlay,
    };

    return {
      id: generateEventId(),
      type: 'GAME_UPDATE',
      timestamp,
      source,
      priority: 2,
      payload,
      gameContext: {
        gameId: game.gameId,
        league: game.league,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        status: 'live',
      },
    };
  }

  private createGameFinalEvent(
    game: LiveGameState,
    timestamp: string,
    source: EventSource
  ): BlazeCraftEvent {
    const payload: GameEventPayload = {
      type: 'GAME_FINAL',
      gameId: game.gameId,
      league: game.league,
      homeScore: game.homeTeam.score,
      awayScore: game.awayTeam.score,
    };

    return {
      id: generateEventId(),
      type: 'GAME_FINAL',
      timestamp,
      source,
      priority: 1,
      payload,
      gameContext: {
        gameId: game.gameId,
        league: game.league,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        status: 'final',
      },
    };
  }

  /**
   * Store delta events to KV for SSE clients to poll.
   */
  async storeDelta(env: Env, events: BlazeCraftEvent[]): Promise<void> {
    if (!env.BSI_GAMEBRIDGE_DELTAS || events.length === 0) {
      return;
    }

    const key = `delta:${Date.now()}`;
    await env.BSI_GAMEBRIDGE_DELTAS.put(key, JSON.stringify(events), {
      expirationTtl: DELTA_TTL_SECONDS,
    });
  }

  /**
   * Get delta events from KV since a given timestamp.
   */
  async getDeltasSince(env: Env, since: number): Promise<BlazeCraftEvent[]> {
    if (!env.BSI_GAMEBRIDGE_DELTAS) {
      return [];
    }

    const events: BlazeCraftEvent[] = [];
    const list = await env.BSI_GAMEBRIDGE_DELTAS.list({ prefix: 'delta:' });

    for (const key of list.keys) {
      const timestamp = parseInt(key.name.split(':')[1], 10);
      if (timestamp > since) {
        const data = await env.BSI_GAMEBRIDGE_DELTAS.get<BlazeCraftEvent[]>(key.name, 'json');
        if (data) {
          events.push(...data);
        }
      }
    }

    return events;
  }
}

export const deltaDetector = new DeltaDetector();
