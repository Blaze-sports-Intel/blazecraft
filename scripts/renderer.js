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
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;

    // Draw base platform shadow for all buildings
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, b.width * 0.4, b.height * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw isometric building based on region type
    try {
      if (region.type === 'townhall') {
        this.drawTownHall(ctx, cx, cy, b.width, b.height, now, region.name);
      } else if (region.type === 'goldmine') {
        this.drawGoldMine(ctx, cx, cy, b.width, b.height, now, region.name);
      } else if (region.type === 'lumber') {
        this.drawLumberMill(ctx, cx, cy, b.width, b.height, now, region.name);
      } else {
        this.drawBarracks(ctx, cx, cy, b.width, b.height, now, region.name);
      }
    } catch (e) {
      // Fallback: draw simple rectangle if building drawing fails
      ctx.save();
      ctx.fillStyle = region.type === 'townhall' ? '#8B7355' : region.type === 'goldmine' ? '#DAA520' : region.type === 'lumber' ? '#228B22' : '#696969';
      ctx.fillRect(b.x, b.y, b.width, b.height);
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.font = 'bold 14px Cinzel, serif';
      ctx.fillStyle = '#FFF';
      ctx.textAlign = 'center';
      ctx.fillText(region.name, cx, cy);
      ctx.restore();
    }

    // activity sparkle
    const last = this.regionActivity.get(region.id) || 0;
    const age = Date.now() - last;
    if (last && age < 5000) {
      const pulse = Math.sin(now / 200) * 0.4 + 0.6;
      ctx.save();
      ctx.globalAlpha = (1 - age / 5000) * pulse;
      ctx.strokeStyle = 'rgba(74,156,45,0.95)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 5, b.y - 5, b.width + 10, b.height + 10);
      ctx.restore();
    }
  }

  // Isometric Town Hall - Main command center
  drawTownHall(ctx, cx, cy, w, h, now, name) {
    const baseW = Math.min(w * 0.85, 120);
    const baseH = baseW * 0.6;
    const roofH = baseW * 0.5;

    ctx.save();

    // Building shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx + 8, cy + baseH * 0.4, baseW * 0.55, baseH * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base platform
    ctx.fillStyle = '#4a4035';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.55, cy);
    ctx.lineTo(cx, cy + baseH * 0.35);
    ctx.lineTo(cx + baseW * 0.55, cy);
    ctx.lineTo(cx, cy - baseH * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b5d4a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Main building body - left face
    ctx.fillStyle = '#3d3428';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.45, cy - baseH * 0.15);
    ctx.lineTo(cx - baseW * 0.45, cy - roofH);
    ctx.lineTo(cx, cy - roofH - baseH * 0.2);
    ctx.lineTo(cx, cy + baseH * 0.15);
    ctx.closePath();
    ctx.fill();

    // Main building body - right face
    ctx.fillStyle = '#524838';
    ctx.beginPath();
    ctx.moveTo(cx + baseW * 0.45, cy - baseH * 0.15);
    ctx.lineTo(cx + baseW * 0.45, cy - roofH);
    ctx.lineTo(cx, cy - roofH - baseH * 0.2);
    ctx.lineTo(cx, cy + baseH * 0.15);
    ctx.closePath();
    ctx.fill();

    // Roof - gold trim
    const pulse = Math.sin(now / 1500) * 0.15 + 0.85;
    ctx.fillStyle = `rgba(180,140,60,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - roofH - baseH * 0.5);
    ctx.lineTo(cx - baseW * 0.55, cy - roofH + baseH * 0.1);
    ctx.lineTo(cx, cy - roofH + baseH * 0.3);
    ctx.lineTo(cx + baseW * 0.55, cy - roofH + baseH * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Banner/flag
    const flagSway = Math.sin(now / 400) * 3;
    ctx.fillStyle = '#8B0000';
    ctx.beginPath();
    ctx.moveTo(cx, cy - roofH - baseH * 0.5);
    ctx.lineTo(cx, cy - roofH - baseH * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - roofH - baseH * 0.9);
    ctx.lineTo(cx + 15 + flagSway, cy - roofH - baseH * 0.8);
    ctx.lineTo(cx + flagSway * 0.5, cy - roofH - baseH * 0.7);
    ctx.closePath();
    ctx.fill();

    // Door
    ctx.fillStyle = '#2a1f15';
    ctx.fillRect(cx - 8, cy - baseH * 0.1, 16, baseH * 0.35);
    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 8, cy - baseH * 0.1, 16, baseH * 0.35);

    // Windows with glow
    ctx.fillStyle = `rgba(255,200,100,${0.5 + Math.sin(now / 800) * 0.3})`;
    ctx.fillRect(cx - baseW * 0.3, cy - roofH + baseH * 0.2, 8, 10);
    ctx.fillRect(cx + baseW * 0.2, cy - roofH + baseH * 0.2, 8, 10);

    // Name label
    ctx.font = 'bold 13px Cinzel, serif';
    ctx.fillStyle = '#D4AF37';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(name, cx, cy + baseH * 0.55);

    ctx.restore();
  }

  // Isometric Gold Mine
  drawGoldMine(ctx, cx, cy, w, h, now, name) {
    const baseW = Math.min(w * 0.75, 100);
    const baseH = baseW * 0.5;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + baseH * 0.3, baseW * 0.5, baseH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mine entrance - rock formation
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.4, cy);
    ctx.lineTo(cx - baseW * 0.3, cy - baseH * 0.8);
    ctx.lineTo(cx, cy - baseH);
    ctx.lineTo(cx + baseW * 0.3, cy - baseH * 0.85);
    ctx.lineTo(cx + baseW * 0.4, cy - baseH * 0.3);
    ctx.lineTo(cx + baseW * 0.35, cy + baseH * 0.15);
    ctx.lineTo(cx - baseW * 0.35, cy + baseH * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6a6a6a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dark mine entrance
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - baseH * 0.1, baseW * 0.2, baseH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gold nuggets
    const goldPulse = Math.sin(now / 600) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(255,215,0,${goldPulse})`;
    ctx.beginPath();
    ctx.arc(cx - baseW * 0.25, cy - baseH * 0.5, 6, 0, Math.PI * 2);
    ctx.arc(cx + baseW * 0.15, cy - baseH * 0.6, 5, 0, Math.PI * 2);
    ctx.arc(cx - baseW * 0.1, cy - baseH * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Sparkles
    const sparkT = (now / 300) % 1;
    ctx.fillStyle = `rgba(255,255,200,${1 - sparkT})`;
    ctx.beginPath();
    ctx.arc(cx - baseW * 0.2 + sparkT * 10, cy - baseH * 0.4 - sparkT * 15, 2, 0, Math.PI * 2);
    ctx.fill();

    // Name label
    ctx.font = 'bold 12px Cinzel, serif';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(name, cx, cy + baseH * 0.5);

    ctx.restore();
  }

  // Isometric Lumber Mill
  drawLumberMill(ctx, cx, cy, w, h, now, name) {
    const baseW = Math.min(w * 0.8, 110);
    const baseH = baseW * 0.55;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy + baseH * 0.35, baseW * 0.5, baseH * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Log pile
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#5a4030' : '#6a5040';
      ctx.beginPath();
      ctx.ellipse(cx - baseW * 0.35 + i * 8, cy + baseH * 0.1, 15, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2820';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Main building - wooden structure
    ctx.fillStyle = '#5a4a35';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.35, cy - baseH * 0.1);
    ctx.lineTo(cx - baseW * 0.35, cy - baseH * 0.7);
    ctx.lineTo(cx, cy - baseH * 0.85);
    ctx.lineTo(cx, cy + baseH * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#6a5a45';
    ctx.beginPath();
    ctx.moveTo(cx + baseW * 0.35, cy - baseH * 0.1);
    ctx.lineTo(cx + baseW * 0.35, cy - baseH * 0.7);
    ctx.lineTo(cx, cy - baseH * 0.85);
    ctx.lineTo(cx, cy + baseH * 0.05);
    ctx.closePath();
    ctx.fill();

    // Wooden slats
    ctx.strokeStyle = '#4a3a28';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - baseW * 0.35, cy - baseH * 0.2 - i * 12);
      ctx.lineTo(cx, cy - baseH * 0.05 - i * 12);
      ctx.stroke();
    }

    // Roof
    ctx.fillStyle = '#228B22';
    ctx.beginPath();
    ctx.moveTo(cx, cy - baseH * 1.1);
    ctx.lineTo(cx - baseW * 0.45, cy - baseH * 0.65);
    ctx.lineTo(cx, cy - baseH * 0.55);
    ctx.lineTo(cx + baseW * 0.45, cy - baseH * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a6b1a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Saw animation
    const sawAngle = (now / 200) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx + baseW * 0.25, cy - baseH * 0.3);
    ctx.rotate(sawAngle);
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.rotate(Math.PI / 4);
    }
    ctx.restore();

    // Name label
    ctx.font = 'bold 12px Cinzel, serif';
    ctx.fillStyle = '#90EE90';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(name, cx, cy + baseH * 0.55);

    ctx.restore();
  }

  // Isometric Barracks (default building)
  drawBarracks(ctx, cx, cy, w, h, now, name) {
    const baseW = Math.min(w * 0.75, 100);
    const baseH = baseW * 0.5;

    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx + 5, cy + baseH * 0.3, baseW * 0.45, baseH * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Foundation
    ctx.fillStyle = '#3d3832';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.45, cy);
    ctx.lineTo(cx, cy + baseH * 0.25);
    ctx.lineTo(cx + baseW * 0.45, cy);
    ctx.lineTo(cx, cy - baseH * 0.25);
    ctx.closePath();
    ctx.fill();

    // Main walls
    ctx.fillStyle = '#4a4540';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.4, cy - baseH * 0.05);
    ctx.lineTo(cx - baseW * 0.4, cy - baseH * 0.6);
    ctx.lineTo(cx, cy - baseH * 0.45);
    ctx.lineTo(cx, cy + baseH * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#5a5550';
    ctx.beginPath();
    ctx.moveTo(cx + baseW * 0.4, cy - baseH * 0.05);
    ctx.lineTo(cx + baseW * 0.4, cy - baseH * 0.6);
    ctx.lineTo(cx, cy - baseH * 0.45);
    ctx.lineTo(cx, cy + baseH * 0.1);
    ctx.closePath();
    ctx.fill();

    // Flat roof
    ctx.fillStyle = '#5d5550';
    ctx.beginPath();
    ctx.moveTo(cx - baseW * 0.45, cy - baseH * 0.6);
    ctx.lineTo(cx, cy - baseH * 0.45);
    ctx.lineTo(cx + baseW * 0.45, cy - baseH * 0.6);
    ctx.lineTo(cx, cy - baseH * 0.75);
    ctx.closePath();
    ctx.fill();

    // Crenellations
    ctx.fillStyle = '#4a4540';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - baseW * 0.35 + i * 18, cy - baseH * 0.75, 8, 10);
    }

    // Name label
    ctx.font = 'bold 11px Cinzel, serif';
    ctx.fillStyle = '#E8DCC4';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(name, cx, cy + baseH * 0.5);

    ctx.restore();
  }

  drawWorker(worker, selected, now) {
    const ctx = this.ctx;
    const x = worker.position.x;
    const y = worker.position.y;

    const bob = Math.sin((now / 250) + (x + y) * 0.01) * 1.2;
    const walkCycle = Math.sin((now / 150) + (x + y) * 0.02);

    // Selection circle on ground
    if (selected) {
      ctx.save();
      ctx.beginPath();
      const selPulse = Math.sin(now / 400) * 0.15 + 0.85;
      ctx.strokeStyle = `rgba(201,162,39,${selPulse})`;
      ctx.lineWidth = 2;
      ctx.ellipse(x, y + 8, 16, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(201,162,39,0.15)';
      ctx.fill();
      ctx.restore();
    }

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw character sprite
    this.drawCharacterSprite(ctx, x, y + bob, worker.status, now, walkCycle);

    // Status indicators above head
    this.drawStatusIndicator(ctx, x, y + bob, worker.status, now);

    // Nameplate
    ctx.save();
    ctx.font = 'bold 11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = selected ? '#D4AF37' : 'rgba(232,220,196,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 4;
    ctx.fillText(worker.name, x, y + bob + 28);
    ctx.restore();
  }

  // Draw a WC3-style character sprite
  drawCharacterSprite(ctx, x, y, status, now, walkCycle) {
    ctx.save();

    // Color palette based on status
    const palette = {
      idle: { body: '#4a6fa5', trim: '#6b8fc5', skin: '#e8c8a8' },
      moving: { body: '#4a6fa5', trim: '#8bb0e5', skin: '#e8c8a8' },
      working: { body: '#2d7a4f', trim: '#4ca870', skin: '#e8c8a8' },
      blocked: { body: '#8b3030', trim: '#b54545', skin: '#d8a888' },
      complete: { body: '#8b7d30', trim: '#b5a545', skin: '#e8c8a8' },
      terminated: { body: '#5a5a5a', trim: '#7a7a7a', skin: '#a8a8a8' },
      hold: { body: '#8b6b30', trim: '#b59545', skin: '#e8c8a8' },
    }[status] || { body: '#4a6fa5', trim: '#6b8fc5', skin: '#e8c8a8' };

    const isWorking = status === 'working';
    const isMoving = status === 'moving';
    const armSwing = isWorking ? Math.sin(now / 100) * 0.5 : (isMoving ? walkCycle * 0.3 : 0);

    // Feet
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.ellipse(x - 4 + (isMoving ? walkCycle * 2 : 0), y + 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4 - (isMoving ? walkCycle * 2 : 0), y + 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 5);
    ctx.lineTo(x - 4 + (isMoving ? walkCycle * 2 : 0), y + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 5);
    ctx.lineTo(x + 4 - (isMoving ? walkCycle * 2 : 0), y + 1);
    ctx.stroke();

    // Body/torso
    ctx.fillStyle = palette.body;
    ctx.beginPath();
    // Rounded rectangle for body
    const bx = x - 6, by = y - 16, bw = 12, bh = 14, br = 3;
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.closePath();
    ctx.fill();

    // Trim/belt
    ctx.fillStyle = palette.trim;
    ctx.fillRect(x - 6, y - 8, 12, 3);

    // Arms
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = 4;
    // Left arm
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 13);
    ctx.lineTo(x - 10 - armSwing * 8, y - 6 + Math.abs(armSwing) * 4);
    ctx.stroke();
    // Right arm
    ctx.beginPath();
    ctx.moveTo(x + 6, y - 13);
    ctx.lineTo(x + 10 + armSwing * 8, y - 6 + Math.abs(armSwing) * 4);
    ctx.stroke();

    // Tool for working status
    if (isWorking) {
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10 + armSwing * 8, y - 6 + Math.abs(armSwing) * 4);
      ctx.lineTo(x + 14 + armSwing * 12, y - 14);
      ctx.stroke();
      // Tool head
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 12 + armSwing * 12, y - 18, 6, 6);
    }

    // Head
    ctx.fillStyle = palette.skin;
    ctx.beginPath();
    ctx.arc(x, y - 20, 6, 0, Math.PI * 2);
    ctx.fill();

    // Hair/helmet
    ctx.fillStyle = status === 'working' ? '#4a3020' : '#2a2a3a';
    ctx.beginPath();
    ctx.arc(x, y - 22, 5, Math.PI, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x - 2, y - 20, 1, 0, Math.PI * 2);
    ctx.arc(x + 2, y - 20, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw status indicator above worker
  drawStatusIndicator(ctx, x, y, status, now) {
    ctx.save();

    if (status === 'working') {
      // Sparkles/work effect
      const t = (now / 150) % 1;
      ctx.fillStyle = `rgba(201,162,39,${0.8 - t * 0.6})`;
      ctx.beginPath();
      ctx.arc(x - 8 + t * 4, y - 28 - t * 8, 2, 0, Math.PI * 2);
      ctx.arc(x + 6 - t * 3, y - 30 - t * 6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (status === 'hold') {
      const pulse = Math.sin(now / 300) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#D4A017';
      // Pause icon
      ctx.fillRect(x - 5, y - 38, 3, 8);
      ctx.fillRect(x + 2, y - 38, 3, 8);
      ctx.shadowColor = 'rgba(212,160,23,0.6)';
      ctx.shadowBlur = 6;
      ctx.fillRect(x - 5, y - 38, 3, 8);
      ctx.fillRect(x + 2, y - 38, 3, 8);
    }

    if (status === 'blocked') {
      const shake = Math.sin(now / 50) * 2;
      ctx.translate(shake, 0);
      // Red exclamation
      ctx.fillStyle = '#c0392b';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText('!', x, y - 32);
      // Warning ring
      ctx.strokeStyle = 'rgba(192,57,43,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 36, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (status === 'complete') {
      const fadeT = (now / 2000) % 1;
      ctx.globalAlpha = 1 - fadeT * 0.5;
      // Checkmark
      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 34);
      ctx.lineTo(x - 1, y - 29);
      ctx.lineTo(x + 7, y - 39);
      ctx.stroke();
      // Rising particles
      ctx.fillStyle = `rgba(39,174,96,${0.7 - fadeT})`;
      ctx.beginPath();
      ctx.arc(x - 4, y - 38 - fadeT * 15, 2, 0, Math.PI * 2);
      ctx.arc(x + 5, y - 40 - fadeT * 12, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

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
