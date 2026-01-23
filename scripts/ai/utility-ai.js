/**
 * BlazeCraft Utility AI System
 *
 * Score-based task/region selection for idle workers.
 * Evaluates multiple factors to make intelligent decisions.
 */

/**
 * Scoring factors for region selection
 */
export const ScoreFactors = {
  PROXIMITY: 'proximity',
  URGENCY: 'urgency',
  ACTIVITY: 'activity',
  AFFINITY: 'affinity',
  CAPACITY: 'capacity',
};

/**
 * Default scoring weights
 */
export const DefaultWeights = {
  [ScoreFactors.PROXIMITY]: 0.25, // Closer regions score higher
  [ScoreFactors.URGENCY]: 0.30, // Higher priority regions score higher
  [ScoreFactors.ACTIVITY]: 0.15, // Recently active regions score lower (spread work)
  [ScoreFactors.AFFINITY]: 0.15, // Worker affinity for region type
  [ScoreFactors.CAPACITY]: 0.15, // Regions with fewer workers score higher
};

/**
 * Region type urgency ratings (0-1)
 */
export const RegionUrgency = {
  goldmine: 1.0,
  lumber: 0.8,
  townhall: 0.6,
  barracks: 0.5,
  library: 0.4,
  workshop: 0.5,
  market: 0.3,
  farm: 0.3,
  blacksmith: 0.4,
  tower: 0.6,
  stables: 0.4,
  ground: 0.1,
};

/**
 * Worker type affinities for regions (0-1)
 * Default worker has no special affinity
 */
export const WorkerAffinities = {
  default: {
    goldmine: 0.5,
    lumber: 0.5,
    townhall: 0.5,
    barracks: 0.5,
    library: 0.5,
    workshop: 0.5,
    market: 0.5,
    farm: 0.5,
    blacksmith: 0.5,
    tower: 0.5,
    stables: 0.5,
    ground: 0.3,
  },
};

/**
 * Utility AI for task/region selection
 */
export class UtilityAI {
  /**
   * @param {object} options
   * @param {object} options.weights - Scoring factor weights
   * @param {object} options.urgencies - Region urgency ratings
   * @param {object} options.affinities - Worker type affinities
   */
  constructor(options = {}) {
    this.weights = { ...DefaultWeights, ...options.weights };
    this.urgencies = { ...RegionUrgency, ...options.urgencies };
    this.affinities = { ...WorkerAffinities, ...options.affinities };
  }

  /**
   * Score a region for a given worker
   * @param {object} worker - Worker object
   * @param {object} region - Region object
   * @param {object} context - Scoring context
   * @returns {number} - Utility score (0-1)
   */
  scoreRegion(worker, region, context = {}) {
    const { regionActivity = {}, workerCounts = {}, worldSize = { width: 1280, height: 720 } } = context;

    const scores = {};

    // 1. Proximity score (inverse of distance, normalized)
    const dx = region.bounds.x + region.bounds.width / 2 - worker.position.x;
    const dy = region.bounds.y + region.bounds.height / 2 - worker.position.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = Math.hypot(worldSize.width, worldSize.height);
    scores[ScoreFactors.PROXIMITY] = 1 - distance / maxDistance;

    // 2. Urgency score (region type priority)
    scores[ScoreFactors.URGENCY] = this.urgencies[region.type] ?? 0.5;

    // 3. Activity score (inverse of recent activity, spread work around)
    const lastActivity = regionActivity[region.id] || 0;
    const activityAge = Date.now() - lastActivity;
    const activityDecay = 10000; // 10 seconds to decay to 0
    scores[ScoreFactors.ACTIVITY] = Math.min(1, activityAge / activityDecay);

    // 4. Affinity score (worker type preference for region)
    const workerType = worker.type || 'default';
    const affinityMap = this.affinities[workerType] || this.affinities.default;
    scores[ScoreFactors.AFFINITY] = affinityMap[region.type] ?? 0.5;

    // 5. Capacity score (fewer workers = higher score)
    const currentWorkers = workerCounts[region.id] || 0;
    const maxCapacity = 5; // Soft cap per region
    scores[ScoreFactors.CAPACITY] = 1 - Math.min(currentWorkers / maxCapacity, 1);

    // Weighted sum
    let totalScore = 0;
    for (const factor of Object.values(ScoreFactors)) {
      totalScore += (scores[factor] || 0) * (this.weights[factor] || 0);
    }

    return {
      total: totalScore,
      factors: scores,
      region,
    };
  }

  /**
   * Select best region for a worker
   * @param {object} worker - Worker object
   * @param {object[]} regions - Available regions
   * @param {object} context - Scoring context
   * @returns {object} - Best region with score details
   */
  selectRegion(worker, regions, context = {}) {
    const scoredRegions = regions.map((r) => this.scoreRegion(worker, r, context));

    // Sort by total score descending
    scoredRegions.sort((a, b) => b.total - a.total);

    // Add some randomness to top choices (pick from top 3)
    const topChoices = scoredRegions.slice(0, 3);
    const weights = topChoices.map((s) => s.total);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    if (totalWeight === 0) {
      return scoredRegions[0];
    }

    let random = Math.random() * totalWeight;
    for (let i = 0; i < topChoices.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return topChoices[i];
      }
    }

    return topChoices[0];
  }

  /**
   * Update weights dynamically based on game state
   * @param {object} gameState - Current game state
   */
  adaptWeights(gameState) {
    const { resources = {}, threats = [] } = gameState;

    // If low on gold, prioritize goldmines
    if (resources.gold < 100) {
      this.urgencies.goldmine = 1.0;
    } else {
      this.urgencies.goldmine = 0.7;
    }

    // If low on lumber, prioritize lumber camps
    if (resources.lumber < 50) {
      this.urgencies.lumber = 0.9;
    } else {
      this.urgencies.lumber = 0.6;
    }

    // If threats detected, prioritize defensive buildings
    if (threats.length > 0) {
      this.urgencies.tower = 0.9;
      this.urgencies.barracks = 0.8;
    }
  }
}

/**
 * Factory function to create utility-based region picker
 * @param {object[]} regions - Available regions
 * @param {object} options - Utility AI options
 * @returns {function} - Region picker function
 */
export function createUtilityPicker(regions, options = {}) {
  const ai = new UtilityAI(options);

  return function pickRegion(worker, state) {
    // Build context from current state
    const context = {
      regionActivity: {},
      workerCounts: {},
    };

    // Count workers per region
    for (const w of state.workers.values()) {
      if (w.targetRegion && w.status !== 'terminated') {
        context.workerCounts[w.targetRegion] = (context.workerCounts[w.targetRegion] || 0) + 1;
      }
    }

    // Get region activity from state if available
    if (state.regionActivity) {
      context.regionActivity = Object.fromEntries(state.regionActivity);
    }

    const result = ai.selectRegion(worker, regions, context);
    return result.region;
  };
}
