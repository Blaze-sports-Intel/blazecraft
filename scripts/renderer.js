import { REGIONS, clamp, regionAt } from './map.js';

/**
 * Canvas renderer for the main map + minimap.
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} mapCanvas
   * @param {HTMLCanvasElement} minimapCanvas
   */
  constructor(mapCanvas, minimapCanvas) {
    this.mapCanvas = mapCanvas;
    this.minimapCanvas = minimapCanvas;
    this.ctx = mapCanvas.getContext('2d', { alpha: false });
    this.mctx = minimapCanvas.getContext('2d', { alpha: false });

    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
    };

    this.selection = {
      active: false,
      x0: 0,
      y0: 0,
      x1: 0,
      y1: 0,
    };

    /** @type {HTMLImageElement|null} */
    this.texPar = null;
    /** @type {HTMLImageElement|null} */
    this.texStone = null;

    this.lastEventTs = 0;
    /** @type {{x:number,y:number,kind:'spawn'|'error',t:number}[]} */
    this.pings = [];

    /** @type {Map<string, number>} */
    this.regionActivity = new Map();

    /** Minimap visibility toggles */
    this.showTerrain = true;
    this.showUnits = true;

    this.world = { w: 1280, h: 720 };

    // Procedural terrain
    this.terrainElements = [];
    this.generateTerrain();

    this.resize();

    window.addEventListener('resize', () => this.resize());
  }

  async loadTextures() {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    try {
      this.texPar = await load('styles/textures/parchment.png');
      this.texStone = await load('styles/textures/stone.png');
    } catch {
      // texture load failing is non-fatal; we fall back to flat fills.
      this.texPar = null;
      this.texStone = null;
    }
  }

  resize() {
    const rect = this.mapCanvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));

    this.mapCanvas.width = Math.floor(w * this.dpr);
    this.mapCanvas.height = Math.floor(h * this.dpr);
    this.mapCanvas.style.width = `${w}px`;
    this.mapCanvas.style.height = `${h}px`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // minimap
    const mrect = this.minimapCanvas.getBoundingClientRect();
    const mw = Math.floor(mrect.width);
    const mh = Math.floor(mrect.height);
    this.minimapCanvas.width = Math.floor(mw * this.dpr);
    this.minimapCanvas.height = Math.floor(mh * this.dpr);
    this.minimapCanvas.style.width = `${mw}px`;
    this.minimapCanvas.style.height = `${mh}px`;
    this.mctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  seededRandom(seed) {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  }

  generateTerrain() {
    const { w, h } = this.world;
    this.terrainElements = [];

    const regionBounds = REGIONS.map(r => ({
      x: r.bounds.x - 30, y: r.bounds.y - 30,
      w: r.bounds.width + 60, h: r.bounds.height + 60
    }));

    const isInRegion = (x, y) => regionBounds.some(b =>
      x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);

    // Grass patches
    for (let i = 0; i < 150; i++) {
      const x = this.seededRandom(i * 3.7) * w;
      const y = this.seededRandom(i * 5.3) * h;
      if (isInRegion(x, y)) continue;
      this.terrainElements.push({ type: 'grass', x, y, size: 8 + this.seededRandom(i * 2.1) * 20, shade: this.seededRandom(i * 1.3) });
    }

    // Trees
    for (let i = 0; i < 30; i++) {
      const x = this.seededRandom(i * 11.3 + 200) * w;
      const y = this.seededRandom(i * 8.7 + 200) * h;
      if (isInRegion(x, y)) continue;
      this.terrainElements.push({ type: 'tree', x, y, height: 30 + this.seededRandom(i * 4.1 + 200) * 25, variant: Math.floor(this.seededRandom(i * 2.3 + 200) * 3) });
    }

    // Rocks
    for (let i = 0; i < 20; i++) {
      const x = this.seededRandom(i * 13.7 + 300) * w;
      const y = this.seededRandom(i * 9.1 + 300) * h;
      if (isInRegion(x, y)) continue;
      this.terrainElements.push({ type: 'rock', x, y, size: 6 + this.seededRandom(i * 5.3 + 300) * 10 });
    }

    this.terrainElements.sort((a, b) => a.y - b.y);
  }

  drawTerrain(now) {
    const ctx = this.ctx;
    for (const el of this.terrainElements) {
      if (el.type === 'grass') this.drawGrass(ctx, el.x, el.y, el.size, el.shade);
      else if (el.type === 'tree') this.drawTree(ctx, el.x, el.y, el.height, el.variant, now);
      else if (el.type === 'rock') this.drawRock(ctx, el.x, el.y, el.size);
    }
  }

  drawGrass(ctx, x, y, size, shade) {
    ctx.fillStyle = `rgba(${30 + shade * 20}, ${80 + shade * 50}, ${20 + shade * 15}, 0.4)`;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTree(ctx, x, y, height, variant, now) {
    const sway = Math.sin(now / 2000 + x * 0.01) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, height * 0.35, height * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a3728';
    ctx.fillRect(x - 3, y - height * 0.35, 6, height * 0.45);

    ctx.fillStyle = ['#2d5a27', '#3d6b37', '#1e4a1e'][variant % 3];
    if (variant === 0) {
      ctx.beginPath();
      ctx.moveTo(x + sway, y - height);
      ctx.lineTo(x - height * 0.3 + sway * 0.5, y - height * 0.25);
      ctx.lineTo(x + height * 0.3 + sway * 0.5, y - height * 0.25);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x + sway, y - height * 0.55, height * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRock(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + size * 0.25, size * 0.7, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x - size * 0.6, y - size * 0.7);
    ctx.lineTo(x + size * 0.4, y - size * 0.8);
    ctx.lineTo(x + size, y - size * 0.15);
    ctx.lineTo(x + size * 0.7, y + size * 0.25);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  screenToWorld(clientX, clientY) {
    const rect = this.mapCanvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;

    const cx = sx - rect.width / 2;
    const cy = sy - rect.height / 2;

    const wx = (cx / this.camera.zoom) + this.camera.x;
    const wy = (cy / this.camera.zoom) + this.camera.y;

    return { x: wx, y: wy };
  }

  worldToScreen(wx, wy) {
    const rect = this.mapCanvas.getBoundingClientRect();
    const sx = (wx - this.camera.x) * this.camera.zoom + rect.width / 2;
    const sy = (wy - this.camera.y) * this.camera.zoom + rect.height / 2;
    return { x: sx, y: sy };
  }

  setSelection(active, x0, y0, x1, y1) {
    this.selection.active = active;
    this.selection.x0 = x0;
    this.selection.y0 = y0;
    this.selection.x1 = x1;
    this.selection.y1 = y1;
  }

  addPing(x, y, kind) {
    this.pings.push({ x, y, kind, t: performance.now() });
    if (this.pings.length > 32) this.pings.shift();
  }

  /**
   * @param {import('./game-state.js').GameState} state
   */
  render(state) {
    const now = performance.now();

    // activity (fog)
    for (const w of state.workers.values()) {
      const last = this.regionActivity.get(w.targetRegion) || 0;
      this.regionActivity.set(w.targetRegion, Math.max(last, w.updatedAt));
    }

    // detect new events for pings
    if (state.events.length) {
      const latest = state.events[state.events.length - 1];
      if (latest.timestamp > this.lastEventTs) {
        this.lastEventTs = latest.timestamp;
        const w = state.workers.get(latest.workerId);
        if (w) {
          if (latest.type === 'spawn') this.addPing(w.position.x, w.position.y, 'spawn');
          if (latest.type === 'error') this.addPing(w.position.x, w.position.y, 'error');
        }
      }
    }

    // clear
    const rect = this.mapCanvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    // background
    this.drawBackground(rect.width, rect.height);

    // world transform
    this.ctx.save();
    this.ctx.translate(rect.width / 2, rect.height / 2);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // ground with grass gradient
    const groundGrad = this.ctx.createRadialGradient(
      this.world.w / 2, this.world.h / 2, 100,
      this.world.w / 2, this.world.h / 2, this.world.w
    );
    groundGrad.addColorStop(0, '#2a4a25');
    groundGrad.addColorStop(0.5, '#1e3a1a');
    groundGrad.addColorStop(1, '#152815');
    this.ctx.fillStyle = groundGrad;
    this.ctx.fillRect(0, 0, this.world.w, this.world.h);

    // Procedural terrain (grass, trees, rocks)
    this.drawTerrain(now);

    // regions
    for (const r of REGIONS) this.drawRegion(r, now);

    // pings
    for (const p of this.pings) this.drawPing(p, now);

    // workers
    for (const w of state.workers.values()) {
      this.drawWorker(w, state.selected.has(w.id), now);
    }

    // selection marquee
    if (this.selection.active) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(201,162,39,0.8)';
      this.ctx.lineWidth = 2 / this.camera.zoom;
      this.ctx.setLineDash([6 / this.camera.zoom, 4 / this.camera.zoom]);
      const x = Math.min(this.selection.x0, this.selection.x1);
      const y = Math.min(this.selection.y0, this.selection.y1);
      const w = Math.abs(this.selection.x1 - this.selection.x0);
      const h = Math.abs(this.selection.y1 - this.selection.y0);
      this.ctx.strokeRect(x, y, w, h);
      this.ctx.restore();
    }

    this.ctx.restore();

    // minimap
    this.drawMinimap(state);
  }

  drawBackground(w, h) {
    const ctx = this.ctx;

    // base
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(0, 0, w, h);

    // parchment overlay
    if (this.texPar) {
      const pat = ctx.createPattern(this.texPar, 'repeat');
      if (pat) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    // vignette
    const g = ctx.createRadialGradient(w * 0.55, h * 0.45, 30, w * 0.5, h * 0.5, Math.max(w, h));
    g.addColorStop(0, 'rgba(0,0,0,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawRegion(region, now) {
    const ctx = this.ctx;
    const b = region.bounds;

    // Building level (1-3) based on region type or can be set externally
    const level = region.level || (region.type === 'townhall' ? 3 : region.type === 'goldmine' ? 2 : 1);

    const palette = {
      townhall: { fill: 'rgba(40,35,28,0.75)', edge: 'rgba(201,162,39,0.9)' },
      goldmine: { fill: 'rgba(55,47,30,0.72)', edge: 'rgba(201,162,39,0.85)' },
      lumber: { fill: 'rgba(35,48,34,0.62)', edge: 'rgba(212,160,23,0.75)' },
      ground: { fill: 'rgba(36,35,33,0.55)', edge: 'rgba(139,115,32,0.65)' },
    }[region.type];

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(b.x + 5, b.y + 6, b.width, b.height);
    ctx.restore();

    // fill
    ctx.save();
    ctx.fillStyle = palette.fill;
    ctx.fillRect(b.x, b.y, b.width, b.height);

    // texture - Level 1: Base stone texture
    if (this.texStone) {
      const pat = ctx.createPattern(this.texStone, 'repeat');
      if (pat) {
        ctx.globalAlpha = 0.08 + (level * 0.02); // More visible at higher levels
        ctx.fillStyle = pat;
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.globalAlpha = 1;
      }
    }

    // Level 2+: Gold corner flourishes
    if (level >= 2) {
      const cornerSize = 12;
      ctx.strokeStyle = 'rgba(201,162,39,0.9)';
      ctx.lineWidth = 3;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(b.x + cornerSize, b.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + cornerSize);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(b.x + b.width - cornerSize, b.y);
      ctx.lineTo(b.x + b.width, b.y);
      ctx.lineTo(b.x + b.width, b.y + cornerSize);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + b.height - cornerSize);
      ctx.lineTo(b.x, b.y + b.height);
      ctx.lineTo(b.x + cornerSize, b.y + b.height);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(b.x + b.width - cornerSize, b.y + b.height);
      ctx.lineTo(b.x + b.width, b.y + b.height);
      ctx.lineTo(b.x + b.width, b.y + b.height - cornerSize);
      ctx.stroke();
    }

    // Level 3: Full gold border with inner glow
    if (level >= 3) {
      // Inner glow
      const glowGrad = ctx.createLinearGradient(b.x, b.y, b.x + b.width, b.y + b.height);
      glowGrad.addColorStop(0, 'rgba(201,162,39,0.15)');
      glowGrad.addColorStop(0.5, 'rgba(201,162,39,0.25)');
      glowGrad.addColorStop(1, 'rgba(201,162,39,0.15)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(b.x + 4, b.y + 4, b.width - 8, b.height - 8);

      // Full gold border
      ctx.strokeStyle = 'rgba(201,162,39,0.95)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.width, b.height);

      // Pulsing glow effect
      const pulse = Math.sin(now / 1000) * 0.3 + 0.7;
      ctx.shadowColor = `rgba(201,162,39,${pulse * 0.5})`;
      ctx.shadowBlur = 12;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.shadowBlur = 0;
    } else {
      // Standard bevel edge for Level 1-2
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    }

    // inner edge
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4);

    // label
    ctx.font = '16px Cinzel, serif';
    ctx.fillStyle = 'rgba(232,220,196,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(region.name, b.x + 12, b.y + 24);

    ctx.restore();

    // activity sparkle
    const last = this.regionActivity.get(region.id) || 0;
    const age = Date.now() - last;
    if (last && age < 5000) {
      const t = (now / 1000) % 1;
      ctx.save();
      ctx.globalAlpha = (1 - age / 5000) * 0.8;
      ctx.strokeStyle = 'rgba(74,156,45,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 4 + t * 6, b.y + 4 + t * 6, b.width - 8 - t * 12, b.height - 8 - t * 12);
      ctx.restore();
    }
  }

  drawWorker(worker, selected, now) {
    const ctx = this.ctx;
    const x = worker.position.x;
    const y = worker.position.y;

    const colors = {
      idle: 'rgba(232,220,196,0.65)',
      moving: 'rgba(232,220,196,0.92)',
      working: 'rgba(74,156,45,0.95)',
      blocked: 'rgba(139,26,26,0.95)',
      complete: 'rgba(74,156,45,0.95)',
      terminated: 'rgba(110,110,110,0.55)',
      hold: 'rgba(212,160,23,0.95)',
    }[worker.status] || 'rgba(232,220,196,0.9)';

    const bob = Math.sin((now / 250) + (x + y) * 0.01) * 1.6;

    // selection ring
    if (selected) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(201,162,39,0.95)';
      ctx.lineWidth = 3;
      ctx.arc(x, y + bob, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // unit
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = colors;
    ctx.arc(x, y + bob, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // status pip
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.arc(x + 6.5, y + bob - 6.5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const pip = worker.status === 'working' ? 'rgba(74,156,45,1)' :
      worker.status === 'blocked' ? 'rgba(139,26,26,1)' :
      worker.status === 'hold' ? 'rgba(212,160,23,1)' :
      'rgba(232,220,196,0.95)';

    ctx.beginPath();
    ctx.fillStyle = pip;
    ctx.arc(x + 6.5, y + bob - 6.5, 2, 0, Math.PI * 2);
    ctx.fill();

    // working sparks
    if (worker.status === 'working') {
      ctx.strokeStyle = 'rgba(201,162,39,0.75)';
      ctx.lineWidth = 2;
      const t = (now / 120) % 1;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + bob - 6);
      ctx.lineTo(x - 4 - t * 6, y + bob - 2);
      ctx.stroke();
    }

    // hold: Pause icon pulsing
    if (worker.status === 'hold') {
      const pulse = Math.sin(now / 300) * 0.3 + 0.7;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(212,160,23,0.95)';

      // Pause bars
      const barWidth = 3;
      const barHeight = 10;
      const gap = 4;
      ctx.fillRect(x - gap / 2 - barWidth, y + bob - barHeight / 2 - 14, barWidth, barHeight);
      ctx.fillRect(x + gap / 2, y + bob - barHeight / 2 - 14, barWidth, barHeight);

      // Glow effect
      ctx.shadowColor = 'rgba(212,160,23,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillRect(x - gap / 2 - barWidth, y + bob - barHeight / 2 - 14, barWidth, barHeight);
      ctx.fillRect(x + gap / 2, y + bob - barHeight / 2 - 14, barWidth, barHeight);
      ctx.restore();
    }

    // blocked: Exclamation with shake
    if (worker.status === 'blocked') {
      const shake = Math.sin(now / 50) * 2; // Fast shake

      ctx.save();
      ctx.translate(shake, 0);

      // Distress ring
      ctx.strokeStyle = 'rgba(139,26,26,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + bob, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Exclamation mark
      ctx.fillStyle = 'rgba(139,26,26,0.95)';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', x, y + bob - 16);

      ctx.restore();
    }

    // complete: Checkmark that fades
    if (worker.status === 'complete') {
      // Calculate fade based on when status changed (use updatedAt if available)
      const completeDuration = 3000; // Fade over 3 seconds
      const statusAge = worker.updatedAt ? (Date.now() - worker.updatedAt) : 0;
      const fadeAlpha = Math.max(0, 1 - statusAge / completeDuration);

      ctx.save();
      ctx.globalAlpha = fadeAlpha * 0.95;

      // Green glow background
      ctx.fillStyle = 'rgba(74,156,45,0.3)';
      ctx.beginPath();
      ctx.arc(x, y + bob - 14, 8, 0, Math.PI * 2);
      ctx.fill();

      // Checkmark
      ctx.strokeStyle = 'rgba(74,156,45,0.95)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 5, y + bob - 14);
      ctx.lineTo(x - 1, y + bob - 10);
      ctx.lineTo(x + 6, y + bob - 18);
      ctx.stroke();

      // Rising sparkle effect
      if (fadeAlpha > 0.5) {
        const sparkleY = y + bob - 20 - (1 - fadeAlpha) * 20;
        ctx.fillStyle = `rgba(74,156,45,${fadeAlpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(x - 3, sparkleY, 2, 0, Math.PI * 2);
        ctx.arc(x + 4, sparkleY - 3, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();

    // nameplate
    ctx.save();
    ctx.font = '12px Crimson Text, serif';
    ctx.fillStyle = 'rgba(232,220,196,0.8)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.fillText(worker.name, x - 18, y + bob + 24);
    ctx.restore();
  }

  drawPing(p, now) {
    const age = (now - p.t) / 1000;
    if (age > 1.4) return;
    const ctx = this.ctx;
    const r = 8 + age * 40;
    const a = (1 - age / 1.4) * 0.8;
    ctx.save();
    ctx.strokeStyle = p.kind === 'error' ? `rgba(139,26,26,${a})` : `rgba(201,162,39,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawMinimap(state) {
    const ctx = this.mctx;
    const rect = this.minimapCanvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // base
    ctx.fillStyle = '#2d2419';
    ctx.fillRect(0, 0, w, h);

    // texture
    if (this.texPar) {
      const pat = ctx.createPattern(this.texPar, 'repeat');
      if (pat) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }

    const sx = w / this.world.w;
    const sy = h / this.world.h;

    // regions (terrain)
    if (this.showTerrain) {
      for (const r of REGIONS) {
        const b = r.bounds;
        ctx.save();
        const last = this.regionActivity.get(r.id) || 0;
        const age = last ? (Date.now() - last) : 999999;
        const fog = clamp(age / 20000, 0, 1);

        ctx.fillStyle = `rgba(0,0,0,${0.25 + fog * 0.55})`;
        ctx.fillRect(b.x * sx, b.y * sy, b.width * sx, b.height * sy);

        ctx.strokeStyle = 'rgba(201,162,39,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x * sx, b.y * sy, b.width * sx, b.height * sy);
        ctx.restore();
      }
    }

    // workers (units)
    if (this.showUnits) {
      for (const wkr of state.workers.values()) {
        const x = wkr.position.x * sx;
        const y = wkr.position.y * sy;
        const col = wkr.status === 'blocked' ? 'rgba(139,26,26,0.95)'
          : wkr.status === 'working' ? 'rgba(74,156,45,0.95)'
          : wkr.status === 'hold' ? 'rgba(212,160,23,0.95)'
          : 'rgba(232,220,196,0.85)';
        ctx.fillStyle = col;
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
    }

    // camera box
    const mapRect = this.mapCanvas.getBoundingClientRect();
    const viewW = mapRect.width / this.camera.zoom;
    const viewH = mapRect.height / this.camera.zoom;

    const vx = (this.camera.x - viewW / 2) * sx;
    const vy = (this.camera.y - viewH / 2) * sy;

    ctx.strokeStyle = 'rgba(232,220,196,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, viewW * sx, viewH * sy);
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  minimapToWorld(clientX, clientY) {
    const rect = this.minimapCanvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;

    return {
      x: clamp(sx, 0, 1) * this.world.w,
      y: clamp(sy, 0, 1) * this.world.h,
    };
  }

  /**
   * Find region by world point.
   * @param {number} wx
   * @param {number} wy
   */
  regionAt(wx, wy) {
    return regionAt(wx, wy);
  }
}
