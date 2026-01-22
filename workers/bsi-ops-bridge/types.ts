/**
 * BSI Ops Bridge Worker Types
 */

export interface Env {
  // KV Namespaces
  BSI_OPS_METRICS: KVNamespace;
  BSI_OPS_EVENTS: KVNamespace;

  // D1 Database
  BSI_GAME_DB: D1Database;

  // Secrets
  BSI_API_KEY?: string;
  HIGHLIGHTLY_API_KEY?: string;

  // Config
  ENVIRONMENT: 'development' | 'staging' | 'production';
}

export type ServiceId =
  | 'bsi-home'
  | 'highlightly-api'
  | 'bsi-gamebridge'
  | 'bsi-game-db'
  | 'kv-sessions'
  | 'kv-cache'
  | 'espn-api'
  | 'stripe-api'
  | 'health-monitor'
  | 'cf-analytics'
  | 'bsi-ops-bridge';

export type ServiceHealth = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceStatus {
  id: ServiceId;
  name: string;
  health: ServiceHealth;
  latency: number;
  lastCheck: string;
  details?: string;
}

export interface OpsMetrics {
  timestamp: string;
  apiRequestsPerMin: number;
  cacheHitRate: number;
  activeConnections: number;
  errorRate: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
}

export type OpsEventType =
  | 'SERVICE_UP'
  | 'SERVICE_DOWN'
  | 'SERVICE_DEGRADED'
  | 'API_CALL'
  | 'API_RESPONSE'
  | 'ERROR'
  | 'DEPLOYMENT'
  | 'CRON_RUN'
  | 'THRESHOLD_ALERT';

export interface OpsEvent {
  id: string;
  type: OpsEventType;
  timestamp: string;
  serviceId?: ServiceId;
  payload: Record<string, unknown>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface HealthAllResponse {
  timestamp: string;
  overall: ServiceHealth;
  services: ServiceStatus[];
  criticalDown: ServiceId[];
}

export interface MetricsResponse {
  timestamp: string;
  metrics: OpsMetrics;
  resources: {
    gold: number;
    lumber: number;
    food: number;
    foodMax: number;
    upkeep: 'low' | 'mid' | 'high';
  };
}

export interface SSEClient {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  mode: 'spectator' | 'ops' | 'admin';
}
