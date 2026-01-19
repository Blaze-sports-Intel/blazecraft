/**
 * Workspace map regions with dynamic building states.
 * Building types evolve based on real agent activity.
 */
export type RegionType =
  | 'goldmine'
  | 'lumber'
  | 'townhall'
  | 'ground'
  | 'barracks'
  | 'library'
  | 'workshop'
  | 'market'
  | 'farm'
  | 'blacksmith'
  | 'tower'
  | 'stables';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapRegion {
  id: string;
  name: string;
  type: RegionType;
  bounds: Rect;
  level: number;
  tasksCompleted: number;
  lastActivity: number;
  upgradeProgress: number;
}

// Building upgrade paths based on activity type
const UPGRADE_PATHS: Record<'goldmine' | 'lumber' | 'townhall' | 'ground', RegionType[]> = {
  goldmine: ['goldmine', 'market', 'library'],
  lumber: ['lumber', 'workshop', 'blacksmith'],
  ground: ['ground', 'farm', 'barracks'],
  townhall: ['townhall', 'tower', 'stables'],
};

// Tasks needed to upgrade to next building level
const UPGRADE_THRESHOLDS = [0, 5, 15, 30];

export const REGIONS: MapRegion[] = [
  { id: 'townhall', name: 'Town Hall', type: 'townhall', bounds: { x: 540, y: 280, width: 240, height: 180 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
  { id: 'src_core', name: 'src/core', type: 'goldmine', bounds: { x: 180, y: 170, width: 260, height: 180 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
  { id: 'src_ui', name: 'src/ui', type: 'goldmine', bounds: { x: 860, y: 150, width: 260, height: 170 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
  { id: 'tests', name: 'tests', type: 'lumber', bounds: { x: 850, y: 400, width: 280, height: 160 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
  { id: 'config', name: 'config', type: 'lumber', bounds: { x: 190, y: 390, width: 240, height: 150 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
  { id: 'docs', name: 'docs', type: 'ground', bounds: { x: 460, y: 500, width: 360, height: 140 }, level: 1, tasksCompleted: 0, lastActivity: 0, upgradeProgress: 0 },
];

/**
 * Record task completion in a region and check for upgrades
 */
export function recordRegionActivity(regionId: string, taskValue = 1) {
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return { upgraded: false, newType: null, level: 0 } as const;

  region.tasksCompleted += taskValue;
  region.lastActivity = Date.now();

  // Get base type for upgrade path
  const baseType = getBaseType(region.type);
  const upgradePath = UPGRADE_PATHS[baseType] || [region.type];
  const maxLevel = upgradePath.length;

  // Check if we should upgrade
  const currentThreshold = UPGRADE_THRESHOLDS[region.level] || Infinity;
  const nextThreshold = UPGRADE_THRESHOLDS[region.level + 1] || Infinity;

  if (region.tasksCompleted >= nextThreshold && region.level < maxLevel) {
    region.level++;
    const newType = upgradePath[region.level - 1];
    if (newType && newType !== region.type) {
      region.type = newType;
      region.upgradeProgress = 0;
      return { upgraded: true, newType, level: region.level } as const;
    }
  }

  // Calculate progress to next level
  if (region.level < maxLevel) {
    const progress = (region.tasksCompleted - currentThreshold) / (nextThreshold - currentThreshold);
    region.upgradeProgress = Math.min(1, Math.max(0, progress));
  }

  return { upgraded: false, newType: null, level: region.level } as const;
}

/**
 * Get the base type for an upgraded building
 */
function getBaseType(type: RegionType) {
  for (const [base, path] of Object.entries(UPGRADE_PATHS)) {
    if (path.includes(type)) return base as keyof typeof UPGRADE_PATHS;
  }
  return 'ground';
}

/**
 * Get region activity level (0-1) based on recent events
 */
export function getRegionActivityLevel(region: MapRegion) {
  const timeSinceActivity = Date.now() - region.lastActivity;
  const decayMs = 10000; // Activity decays over 10 seconds
  return Math.max(0, 1 - (timeSinceActivity / decayMs));
}

export function regionAt(x: number, y: number) {
  for (const r of REGIONS) {
    const b = r.bounds;
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return r;
  }
  return null;
}

export function randomPointIn(region: MapRegion) {
  const b = region.bounds;
  const pad = 18;
  return {
    x: b.x + pad + Math.random() * (b.width - pad * 2),
    y: b.y + pad + Math.random() * (b.height - pad * 2),
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
