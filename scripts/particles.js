/**
 * BlazeCraft Particle System
 *
 * Visual effects for worker spawn, task complete, errors, and building upgrades.
 * Lightweight canvas-based particle rendering.
 */

/**
 * Particle types with their visual configs
 */
const PARTICLE_CONFIGS = {
  spark: {
    color: '#FF6B35', // BSI ember
    size: { min: 2, max: 4 },
    speed: { min: 1, max: 3 },
    life: { min: 300, max: 600 },
    gravity: -0.02, // Float upward
    spread: Math.PI * 2,
    fade: true,
  },
  gold: {
    color: '#DAA520', // WC3 gold
    size: { min: 3, max: 6 },
    speed: { min: 0.5, max: 2 },
    life: { min: 500, max: 1000 },
    gravity: 0.05, // Fall down
    spread: Math.PI,
    fade: true,
  },
  dust: {
    color: '#8B4513', // Texas soil
    size: { min: 1, max: 3 },
    speed: { min: 0.3, max: 1 },
    life: { min: 400, max: 800 },
    gravity: 0.02,
    spread: Math.PI * 2,
    fade: true,
  },
  error: {
    color: '#ff4d4d', // Error red
    size: { min: 2, max: 5 },
    speed: { min: 2, max: 4 },
    life: { min: 200, max: 400 },
    gravity: 0,
    spread: Math.PI * 2,
    fade: true,
  },
  complete: {
    color: '#37d67a', // Success green
    size: { min: 3, max: 5 },
    speed: { min: 1, max: 2.5 },
    life: { min: 400, max: 700 },
    gravity: -0.03,
    spread: Math.PI * 0.5, // Upward burst
    fade: true,
  },
  confetti: {
    colors: ['#DAA520', '#FF6B35', '#BF5700', '#37d67a', '#f7c948'],
    size: { min: 4, max: 8 },
    speed: { min: 2, max: 5 },
    life: { min: 800, max: 1500 },
    gravity: 0.08,
    spread: Math.PI,
    fade: false,
    rotate: true,
  },
};

/**
 * Individual particle
 */
class Particle {
  constructor(x, y, config) {
    this.x = x;
    this.y = y;

    // Random direction within spread angle
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * config.spread;
    const speed = config.speed.min + Math.random() * (config.speed.max - config.speed.min);

    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.size = config.size.min + Math.random() * (config.size.max - config.size.min);
    this.life = config.life.min + Math.random() * (config.life.max - config.life.min);
    this.maxLife = this.life;

    this.gravity = config.gravity;
    this.fade = config.fade;
    this.rotate = config.rotate || false;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.2;

    // Handle multi-color particles (confetti)
    if (config.colors) {
      this.color = config.colors[Math.floor(Math.random() * config.colors.length)];
    } else {
      this.color = config.color;
    }

    this.born = Date.now();
  }

  update(dt) {
    this.vy += this.gravity;
    this.x += this.vx * dt * 0.06;
    this.y += this.vy * dt * 0.06;
    this.life -= dt;

    if (this.rotate) {
      this.rotation += this.rotationSpeed;
    }

    return this.life > 0;
  }

  draw(ctx) {
    const alpha = this.fade ? this.life / this.maxLife : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;

    if (this.rotate) {
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Particle System Manager
 */
export class ParticleSystem {
  constructor() {
    /** @type {Particle[]} */
    this.particles = [];
    this.lastUpdate = Date.now();
  }

  /**
   * Emit particles at a position
   * @param {'spark'|'gold'|'dust'|'error'|'complete'|'confetti'} type - Particle type
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} count - Number of particles
   */
  emit(type, x, y, count = 10) {
    const config = PARTICLE_CONFIGS[type];
    if (!config) {
      console.warn(`Unknown particle type: ${type}`);
      return;
    }

    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, config));
    }
  }

  /**
   * Emit a burst pattern (radial)
   * @param {'spark'|'gold'|'dust'|'error'|'complete'|'confetti'} type
   * @param {number} x
   * @param {number} y
   * @param {number} count
   * @param {number} radius - Burst radius
   */
  burst(type, x, y, count = 20, radius = 20) {
    const config = PARTICLE_CONFIGS[type];
    if (!config) return;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = x + Math.cos(angle) * (Math.random() * radius);
      const py = y + Math.sin(angle) * (Math.random() * radius);
      this.particles.push(new Particle(px, py, config));
    }
  }

  /**
   * Emit along a line (for trails)
   * @param {string} type
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {number} count
   */
  trail(type, x1, y1, x2, y2, count = 5) {
    const config = PARTICLE_CONFIGS[type];
    if (!config) return;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      this.particles.push(new Particle(x, y, config));
    }
  }

  /**
   * Update all particles
   */
  update() {
    const now = Date.now();
    const dt = now - this.lastUpdate;
    this.lastUpdate = now;

    this.particles = this.particles.filter((p) => p.update(dt));
  }

  /**
   * Draw all particles
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    for (const p of this.particles) {
      p.draw(ctx);
    }
  }

  /**
   * Clear all particles
   */
  clear() {
    this.particles = [];
  }

  /**
   * Get particle count
   */
  get count() {
    return this.particles.length;
  }
}

// =============================================================================
// Pre-built effect functions
// =============================================================================

/**
 * Worker spawn effect - gold sparkle burst
 * @param {ParticleSystem} ps
 * @param {number} x
 * @param {number} y
 */
export function effectWorkerSpawn(ps, x, y) {
  ps.burst('gold', x, y, 15, 15);
  ps.emit('spark', x, y, 5);
}

/**
 * Task complete effect - green checkmark particles
 * @param {ParticleSystem} ps
 * @param {number} x
 * @param {number} y
 */
export function effectTaskComplete(ps, x, y) {
  ps.burst('complete', x, y, 20, 10);
}

/**
 * Error effect - red warning particles
 * @param {ParticleSystem} ps
 * @param {number} x
 * @param {number} y
 */
export function effectError(ps, x, y) {
  ps.burst('error', x, y, 25, 20);
}

/**
 * Building upgrade effect - confetti burst
 * @param {ParticleSystem} ps
 * @param {number} x
 * @param {number} y
 */
export function effectBuildingUpgrade(ps, x, y) {
  ps.burst('confetti', x, y, 40, 30);
  ps.emit('gold', x, y - 20, 10);
}

/**
 * Worker movement dust trail
 * @param {ParticleSystem} ps
 * @param {number} x
 * @param {number} y
 */
export function effectMoveDust(ps, x, y) {
  if (Math.random() < 0.3) {
    ps.emit('dust', x, y + 5, 1);
  }
}
