/**
 * Workspace map regions.
 * This is a stylized abstraction of a codebase.
 * @typedef {'goldmine'|'lumber'|'townhall'|'ground'} RegionType
 * @typedef {{x:number,y:number,width:number,height:number}} Rect
 * @typedef {{id:string,name:string,type:RegionType,bounds:Rect}} MapRegion
 */

/** @type {MapRegion[]} */
export const REGIONS = [
  { id: 'townhall', name: 'Town Hall', type: 'townhall', bounds: { x: 540, y: 280, width: 240, height: 180 } },
  { id: 'src_core', name: 'src/core', type: 'goldmine', bounds: { x: 180, y: 170, width: 260, height: 180 } },
  { id: 'src_ui', name: 'src/ui', type: 'goldmine', bounds: { x: 860, y: 150, width: 260, height: 170 } },
  { id: 'tests', name: 'tests', type: 'lumber', bounds: { x: 850, y: 400, width: 280, height: 160 } },
  { id: 'config', name: 'config', type: 'lumber', bounds: { x: 190, y: 390, width: 240, height: 150 } },
  { id: 'docs', name: 'docs', type: 'ground', bounds: { x: 460, y: 500, width: 360, height: 140 } },
];

/**
 * @param {number} x
 * @param {number} y
 * @returns {MapRegion|null}
 */
export function regionAt(x, y) {
  for (const r of REGIONS) {
    const b = r.bounds;
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return r;
  }
  return null;
}

/**
 * @param {MapRegion} region
 */
export function randomPointIn(region) {
  const b = region.bounds;
  const pad = 18;
  return {
    x: b.x + pad + Math.random() * (b.width - pad * 2),
    y: b.y + pad + Math.random() * (b.height - pad * 2),
  };
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 */
export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
