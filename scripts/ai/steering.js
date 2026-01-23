/**
 * BlazeCraft Steering Behaviors
 *
 * Movement behaviors for smoother, more natural worker motion.
 * Implements Seek, Arrive, Separation, Cohesion, and Alignment.
 */

/**
 * 2D Vector utilities
 */
export const Vec2 = {
  create(x = 0, y = 0) {
    return { x, y };
  },

  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  },

  length(v) {
    return Math.hypot(v.x, v.y);
  },

  normalize(v) {
    const len = Vec2.length(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  limit(v, max) {
    const len = Vec2.length(v);
    if (len > max) {
      return Vec2.scale(Vec2.normalize(v), max);
    }
    return v;
  },

  distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  },
};

/**
 * Steering behaviors class
 */
export class SteeringBehaviors {
  /**
   * @param {object} options
   * @param {number} options.maxSpeed - Maximum speed
   * @param {number} options.maxForce - Maximum steering force
   * @param {number} options.arriveRadius - Radius to start slowing down
   * @param {number} options.separationRadius - Radius for separation behavior
   * @param {number} options.cohesionRadius - Radius for cohesion behavior
   */
  constructor(options = {}) {
    this.maxSpeed = options.maxSpeed ?? 3.0;
    this.maxForce = options.maxForce ?? 0.3;
    this.arriveRadius = options.arriveRadius ?? 50;
    this.separationRadius = options.separationRadius ?? 30;
    this.cohesionRadius = options.cohesionRadius ?? 80;
  }

  /**
   * Seek: Move toward a target at max speed
   * @param {object} position - Current position
   * @param {object} target - Target position
   * @param {number} currentSpeed - Current movement speed
   * @returns {object} - Velocity vector
   */
  seek(position, target, currentSpeed = this.maxSpeed) {
    const desired = Vec2.sub(target, position);
    const distance = Vec2.length(desired);

    if (distance === 0) return Vec2.create();

    const normalized = Vec2.normalize(desired);
    return Vec2.scale(normalized, currentSpeed);
  }

  /**
   * Arrive: Seek with deceleration near target
   * @param {object} position - Current position
   * @param {object} target - Target position
   * @param {number} currentSpeed - Current movement speed
   * @returns {object} - Velocity vector
   */
  arrive(position, target, currentSpeed = this.maxSpeed) {
    const desired = Vec2.sub(target, position);
    const distance = Vec2.length(desired);

    if (distance === 0) return Vec2.create();

    let speed = currentSpeed;

    // Slow down when within arrive radius
    if (distance < this.arriveRadius) {
      speed = (distance / this.arriveRadius) * currentSpeed;
    }

    const normalized = Vec2.normalize(desired);
    return Vec2.scale(normalized, speed);
  }

  /**
   * Flee: Move away from a target
   * @param {object} position - Current position
   * @param {object} threat - Position to flee from
   * @param {number} currentSpeed - Current movement speed
   * @returns {object} - Velocity vector
   */
  flee(position, threat, currentSpeed = this.maxSpeed) {
    const desired = Vec2.sub(position, threat);
    const distance = Vec2.length(desired);

    if (distance === 0) return Vec2.create();

    const normalized = Vec2.normalize(desired);
    return Vec2.scale(normalized, currentSpeed);
  }

  /**
   * Separation: Steer away from nearby neighbors
   * @param {object} position - Current position
   * @param {object[]} neighbors - Array of neighbor positions
   * @returns {object} - Steering force vector
   */
  separation(position, neighbors) {
    let steering = Vec2.create();
    let count = 0;

    for (const neighbor of neighbors) {
      const distance = Vec2.distance(position, neighbor);

      if (distance > 0 && distance < this.separationRadius) {
        // Vector pointing away from neighbor
        let diff = Vec2.sub(position, neighbor);
        diff = Vec2.normalize(diff);
        // Weight by inverse distance (closer = stronger)
        diff = Vec2.scale(diff, 1 / distance);
        steering = Vec2.add(steering, diff);
        count++;
      }
    }

    if (count > 0) {
      steering = Vec2.scale(steering, 1 / count);
      steering = Vec2.normalize(steering);
      steering = Vec2.scale(steering, this.maxSpeed);
    }

    return Vec2.limit(steering, this.maxForce);
  }

  /**
   * Cohesion: Steer toward center of nearby neighbors
   * @param {object} position - Current position
   * @param {object[]} neighbors - Array of neighbor positions
   * @returns {object} - Steering force vector
   */
  cohesion(position, neighbors) {
    let center = Vec2.create();
    let count = 0;

    for (const neighbor of neighbors) {
      const distance = Vec2.distance(position, neighbor);

      if (distance > 0 && distance < this.cohesionRadius) {
        center = Vec2.add(center, neighbor);
        count++;
      }
    }

    if (count > 0) {
      center = Vec2.scale(center, 1 / count);
      return this.seek(position, center, this.maxSpeed * 0.5);
    }

    return Vec2.create();
  }

  /**
   * Wander: Random steering for natural movement variation
   * @param {object} currentVelocity - Current velocity
   * @param {number} wanderStrength - How much to wander (0-1)
   * @returns {object} - Modified velocity vector
   */
  wander(currentVelocity, wanderStrength = 0.1) {
    const angle = (Math.random() - 0.5) * Math.PI * wanderStrength;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: currentVelocity.x * cos - currentVelocity.y * sin,
      y: currentVelocity.x * sin + currentVelocity.y * cos,
    };
  }

  /**
   * Combine multiple behaviors with weights
   * @param {Array<{behavior: object, weight: number}>} behaviors - Weighted behaviors
   * @returns {object} - Combined velocity vector
   */
  combine(behaviors) {
    let combined = Vec2.create();

    for (const { behavior, weight } of behaviors) {
      combined = Vec2.add(combined, Vec2.scale(behavior, weight));
    }

    return Vec2.limit(combined, this.maxSpeed);
  }
}

/**
 * Factory to create steering-based movement handler
 * @param {object} options - Steering options
 * @returns {SteeringBehaviors} - Configured steering behaviors instance
 */
export function createSteeringBehaviors(options = {}) {
  return new SteeringBehaviors(options);
}

/**
 * Helper to get all nearby worker positions
 * @param {object} worker - Current worker
 * @param {Map} workers - All workers map
 * @param {number} radius - Search radius
 * @returns {object[]} - Array of neighbor positions
 */
export function getNearbyPositions(worker, workers, radius) {
  const positions = [];

  for (const w of workers.values()) {
    if (w.id === worker.id) continue;
    if (w.status === 'terminated') continue;

    const distance = Vec2.distance(worker.position, w.position);
    if (distance < radius) {
      positions.push(w.position);
    }
  }

  return positions;
}
