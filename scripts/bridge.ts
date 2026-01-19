import type { MapRegion } from './map.js';

export interface CommandBridge {
  manualAssign?(workerIds: string[], region: MapRegion): void;
}

export interface AgentBridge extends CommandBridge {
  connect(): Promise<void> | void;
  disconnect(): void;
}
