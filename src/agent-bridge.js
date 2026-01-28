/**
 * Agent Bridge Client
 * Connects BlazeCraft to live Claude/Codex agent events via SSE.
 */

/**
 * @typedef {'AGENT_SPAWN'|'TASK_START'|'TASK_PROGRESS'|'TASK_COMPLETE'|'AGENT_ERROR'|'AGENT_TERMINATED'|'AGENT_HEARTBEAT'} AgentEventType
 * @typedef {'idle'|'working'|'moving'|'blocked'|'complete'|'terminated'|'hold'} AgentStatus
 * @typedef {{
 *  id: string,
 *  type: AgentEventType,
 *  timestamp: string,
 *  timestampMs: number,
 *  agentId: string,
 *  agentName?: string,
 *  status?: AgentStatus,
 *  task?: string,
 *  progress?: number,
 *  tokensUsed?: number,
 *  details?: string,
 *  source?: 'claude'|'codex'|'bsi',
 *  sessionId?: string,
 *  regionId?: string
 * }} AgentEvent
 * @typedef {{
 *  agentId: string,
 *  agentName: string | null,
 *  status: AgentStatus | null,
 *  task: string | null,
 *  progress: number | null,
 *  tokensUsed: number | null,
 *  updatedAt: string,
 *  updatedAtMs: number,
 *  source: 'claude'|'codex'|'bsi' | null,
 *  sessionId: string | null,
 *  regionId: string | null
 * }} AgentSnapshot
 */

export class AgentBridge {
  /**
   * @param {object} options
   * @param {string} [options.endpoint]
   * @param {string} [options.snapshotEndpoint]
   * @param {boolean} [options.demo]
   * @param {(event: AgentEvent) => void} [options.onEvent]
   * @param {(connected: boolean) => void} [options.onConnection]
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || '/api/agents/stream';
    this.snapshotEndpoint = options.snapshotEndpoint || '/api/agents/snapshot';
    this.demo = options.demo ?? false;
    this.onEvent = options.onEvent || (() => {});
    this.onConnection = options.onConnection || (() => {});

    /** @type {EventSource | null} */
    this.eventSource = null;
    this.connected = false;
  }

  async connect() {
    if (this.demo) {
      this.connected = true;
      this.onConnection(true);
      return;
    }

    if (this.eventSource) {
      this.eventSource.close();
    }

    return new Promise((resolve) => {
      let resolved = false;
      this.eventSource = new EventSource(this.endpoint);

      this.eventSource.onopen = () => {
        this.connected = true;
        this.onConnection(true);
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      this.eventSource.onerror = () => {
        this.connected = false;
        this.onConnection(false);
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      this.eventSource.addEventListener('AGENT_EVENT', (evt) => {
        try {
          const event = JSON.parse(evt.data);
          this.onEvent(event);
        } catch (err) {
          console.warn('[AgentBridge] Failed to parse event', err);
        }
      });
    });
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.onConnection(false);
  }

  /**
   * @returns {Promise<AgentSnapshot[] | null>}
   */
  async fetchSnapshot() {
    if (this.demo) return null;
    try {
      const response = await fetch(this.snapshotEndpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data.agents) ? data.agents : [];
    } catch (err) {
      console.warn('[AgentBridge] Snapshot fetch failed', err);
      return null;
    }
  }
}

export const agentBridge = new AgentBridge();
