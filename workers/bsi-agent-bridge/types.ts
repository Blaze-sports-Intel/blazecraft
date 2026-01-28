export type AgentStatus = 'idle' | 'working' | 'moving' | 'blocked' | 'complete' | 'terminated' | 'hold';

export type AgentEventType =
  | 'AGENT_SPAWN'
  | 'TASK_START'
  | 'TASK_PROGRESS'
  | 'TASK_COMPLETE'
  | 'AGENT_ERROR'
  | 'AGENT_TERMINATED'
  | 'AGENT_HEARTBEAT';

export interface AgentEventInput {
  id?: string;
  type: AgentEventType;
  timestampMs?: number;
  agentId: string;
  agentName?: string;
  status?: AgentStatus;
  task?: string;
  progress?: number;
  tokensUsed?: number;
  details?: string;
  source?: 'claude' | 'codex' | 'bsi';
  sessionId?: string;
  regionId?: string;
}

export interface AgentEvent extends AgentEventInput {
  id: string;
  timestamp: string;
  timestampMs: number;
}

export interface AgentSnapshot {
  agentId: string;
  agentName: string | null;
  status: AgentStatus | null;
  task: string | null;
  progress: number | null;
  tokensUsed: number | null;
  updatedAt: string;
  updatedAtMs: number;
  source: 'claude' | 'codex' | 'bsi' | null;
  sessionId: string | null;
  regionId: string | null;
}

export interface Env {
  BSI_AGENT_DB: D1Database;
  BSI_API_KEY?: string;
}

export interface HealthResponse {
  status: 'ok';
  service: 'bsi-agent-bridge';
  timestamp: string;
  version: string;
}

export interface IngestResponse {
  accepted: number;
  rejected: number;
  ids: string[];
  timestamp: string;
}

export interface SnapshotResponse {
  timestamp: string;
  agents: AgentSnapshot[];
}

export interface ErrorResponse {
  error: string;
  timestamp: string;
}
