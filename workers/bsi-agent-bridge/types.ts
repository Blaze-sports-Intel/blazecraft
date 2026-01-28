/**
 * BSI Agent Bridge Worker Types
 */

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<void>;
}

export interface Env {
  BSI_AGENT_DB: D1Database;
  BSI_API_KEY?: string;
  BSI_AGENT_KEY?: string;
  ENVIRONMENT?: 'development' | 'staging' | 'production';
}

export type AgentEventType =
  | 'spawn'
  | 'task_start'
  | 'task_update'
  | 'task_complete'
  | 'error'
  | 'terminate'
  | 'status';

export type AgentSource = 'claude' | 'codex' | 'system' | 'unknown';

export interface AgentEventPayload {
  task?: string;
  tokens?: number;
  progress?: number;
  status?: string;
  error?: string;
  regionId?: string;
  filesModified?: number;
}

export interface AgentEvent {
  id: string;
  type: AgentEventType;
  agentId: string;
  agentName?: string;
  timestamp: string;
  createdAt: string;
  data: AgentEventPayload;
  source: AgentSource;
}

export interface AgentState {
  agentId: string;
  agentName?: string;
  status: string;
  currentTask?: string;
  progress?: number;
  tokens?: number;
  updatedAt: string;
  source: AgentSource;
  regionId?: string;
}

export interface AgentEventRequest {
  id?: string;
  type: AgentEventType;
  agentId: string;
  agentName?: string;
  timestamp?: string;
  data?: AgentEventPayload;
  source?: AgentSource;
}

export interface AgentEventResponse {
  accepted: number;
  timestamp: string;
}
