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

    this.world = { w: 1280, h: 720 };

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

    // ground
    this.ctx.fillStyle = 'rgba(0,0,0,0.15)';
    this.ctx.fillRect(0, 0, this.world.w, this.world.h);

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

    // texture
    if (this.texStone) {
      const pat = ctx.createPattern(this.texStone, 'repeat');
      if (pat) {
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = pat;
        ctx.fillRect(b.x, b.y, b.width, b.height);
        ctx.globalAlpha = 1;
      }
    }

    // bevel edge
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.width, b.height);

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

    // blocked distress
    if (worker.status === 'blocked') {
      ctx.strokeStyle = 'rgba(139,26,26,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + bob, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    // complete check
    if (worker.status === 'complete') {
      ctx.strokeStyle = 'rgba(232,220,196,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + bob + 0);
      ctx.lineTo(x - 1, y + bob + 3);
      ctx.lineTo(x + 6, y + bob - 4);
      ctx.stroke();
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

    // regions
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

    // workers
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
