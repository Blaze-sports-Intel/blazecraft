/**
 * EventTransformer - Maps BSI sports events to BlazeCraft game effects
 *
 * Transforms real sports signals into RTS gameplay:
 * - Resource generation
 * - Building progression
 * - Buff/debuff timers
 * - Crisis events
 */

import type {
  BlazeCraftEvent,
  BlazeCraftEventType,
  EventGameMapping,
  ResourceEffect,
  BuildingCategory,
  GameEventPayload,
  StandingsPayload,
  InjuryPayload,
  MomentumPayload,
  HighlightPayload,
  LineupPayload,
  OddsPayload,
  OpsHealthPayload,
} from './types';

/** Event to building category mapping */
const EVENT_BUILDING_MAP: Record<BlazeCraftEventType, BuildingCategory> = {
  WORLD_TICK: 'townhall',
  GAME_START: 'townhall',
  GAME_UPDATE: 'production',
  GAME_FINAL: 'command',
  STANDINGS_DELTA: 'defense',
  LINEUP_POSTED: 'research',
  ODDS_SHIFT: 'storage',
  HIGHLIGHT_CLIP: 'production',
  INJURY_ALERT: 'repairs',
  MOMENTUM_SWING: 'tower',
  OPS_HEARTBEAT: 'townhall',
  OPS_DEGRADED: 'repairs',
  OPS_RECOVERED: 'repairs',
};

export class EventTransformer {
  /**
   * Transform a BlazeCraft event into game effects.
   */
  transform(event: BlazeCraftEvent): EventGameMapping {
    const buildingCategory = EVENT_BUILDING_MAP[event.type];
    const resourceEffect = this.calculateResourceEffect(event);
    const duration = this.calculateDuration(event);
    const crisisTask = this.getCrisisTask(event);

    return {
      buildingCategory,
      resourceEffect,
      duration,
      crisisTask,
    };
  }

  /**
   * Calculate resource effects based on event type and payload.
   */
  private calculateResourceEffect(event: BlazeCraftEvent): ResourceEffect {
    const effect: ResourceEffect = {};

    switch (event.type) {
      case 'GAME_START':
        // Game starting = new opportunity, spawn worker slot
        effect.workerSlots = 1;
        effect.gold = 10;
        break;

      case 'GAME_UPDATE': {
        // Score change = resource generation based on margin
        const payload = event.payload as GameEventPayload;
        const margin = Math.abs(payload.homeScore - payload.awayScore);
        effect.gold = 5 + margin * 2;
        break;
      }

      case 'GAME_FINAL': {
        // Game ends = major reward
        const payload = event.payload as GameEventPayload;
        effect.intel = 15;
        effect.gold = 25;
        // Bonus for close game (more exciting)
        const margin = Math.abs(payload.homeScore - payload.awayScore);
        if (margin <= 3) {
          effect.morale = 10;
        }
        break;
      }

      case 'STANDINGS_DELTA': {
        // Ranking shift = influence change
        const payload = event.payload as StandingsPayload;
        effect.influence = payload.delta * 5;
        break;
      }

      case 'LINEUP_POSTED':
        // Lineup revealed = intel window
        effect.intel = 20;
        break;

      case 'ODDS_SHIFT': {
        // Market movement = gold opportunity
        const payload = event.payload as OddsPayload;
        const movement = Math.abs(payload.newLine - payload.previousLine);
        effect.gold = payload.movement === 'sharp' ? movement : Math.floor(movement / 2);
        break;
      }

      case 'HIGHLIGHT_CLIP': {
        // Big play = morale surge
        const payload = event.payload as HighlightPayload;
        effect.morale = this.getHighlightMorale(payload.playType);
        break;
      }

      case 'INJURY_ALERT': {
        // Injury = negative effect (crisis)
        const payload = event.payload as InjuryPayload;
        const severityPenalty = {
          minor: -5,
          moderate: -10,
          severe: -20,
          unknown: -8,
        };
        effect.morale = severityPenalty[payload.severity];
        break;
      }

      case 'MOMENTUM_SWING': {
        // Win probability shift = buff/debuff
        const payload = event.payload as MomentumPayload;
        if (payload.swingMagnitude > 20) {
          effect.morale = payload.newWinProb > payload.previousWinProb ? 15 : -15;
        } else {
          effect.morale = payload.newWinProb > payload.previousWinProb ? 5 : -5;
        }
        break;
      }

      case 'OPS_HEARTBEAT':
        // System healthy = small intel gain
        effect.intel = 1;
        break;

      case 'OPS_DEGRADED': {
        // Service degraded = morale hit
        const opsPayload = event.payload as OpsHealthPayload;
        effect.morale = opsPayload.status === 'unhealthy' ? -25 : -15;
        break;
      }

      case 'OPS_RECOVERED':
        // Service recovered = intel + morale boost
        effect.intel = 10;
        effect.morale = 15;
        break;

      case 'WORLD_TICK':
      default:
        // Heartbeat - no direct resource effect
        break;
    }

    return effect;
  }

  /**
   * Calculate buff/debuff duration for applicable events.
   */
  private calculateDuration(event: BlazeCraftEvent): number | undefined {
    switch (event.type) {
      case 'LINEUP_POSTED':
        // Intel window lasts 60 seconds
        return 60;

      case 'HIGHLIGHT_CLIP':
        // Morale surge lasts 30 seconds
        return 30;

      case 'MOMENTUM_SWING': {
        // Duration based on swing magnitude
        const payload = event.payload as MomentumPayload;
        return Math.min(120, 30 + payload.swingMagnitude);
      }

      case 'INJURY_ALERT': {
        // Crisis duration based on severity
        const payload = event.payload as InjuryPayload;
        const durations = {
          minor: 30,
          moderate: 60,
          severe: 120,
          unknown: 45,
        };
        return durations[payload.severity];
      }

      case 'OPS_DEGRADED':
        // Degraded state persists until recovery
        return 120;

      case 'OPS_RECOVERED':
        // Recovery buff lasts 60 seconds
        return 60;

      default:
        return undefined;
    }
  }

  /**
   * Generate crisis task description for injury events.
   */
  private getCrisisTask(event: BlazeCraftEvent): string | undefined {
    if (event.type !== 'INJURY_ALERT') return undefined;

    const payload = event.payload as InjuryPayload;
    const tasks = {
      minor: `Monitor ${payload.playerName} status`,
      moderate: `Evaluate roster options after ${payload.playerName} injury`,
      severe: `Emergency: ${payload.playerName} out - adjust strategy`,
      unknown: `Assess ${payload.playerName} situation`,
    };

    return tasks[payload.severity];
  }

  /**
   * Get morale boost for highlight play types.
   */
  private getHighlightMorale(playType: string): number {
    const moraleMap: Record<string, number> = {
      homerun: 15,
      touchdown: 20,
      goal: 12,
      dunk: 10,
      strikeout: 8,
      interception: 18,
      other: 5,
    };
    return moraleMap[playType] || 5;
  }

  /**
   * Get game stat category for building progression.
   * Maps event types to GameState eventStats keys.
   */
  getStatCategory(event: BlazeCraftEvent): string {
    const categoryMap: Record<BlazeCraftEventType, string> = {
      WORLD_TICK: 'defense',
      GAME_START: 'spawns',
      GAME_UPDATE: 'production',
      GAME_FINAL: 'commands',
      STANDINGS_DELTA: 'defense',
      LINEUP_POSTED: 'research',
      ODDS_SHIFT: 'storage',
      HIGHLIGHT_CLIP: 'production',
      INJURY_ALERT: 'repairs',
      MOMENTUM_SWING: 'defense',
      OPS_HEARTBEAT: 'defense',
      OPS_DEGRADED: 'repairs',
      OPS_RECOVERED: 'repairs',
    };
    return categoryMap[event.type] || 'production';
  }
}
