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

export const REGIONS: MapRegion[];

export function randomPointIn(region: MapRegion): { x: number; y: number };
