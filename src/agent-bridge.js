/**
 * Agent Bridge Client
 *
 * Connects BlazeCraft to agent telemetry via SSE.
 */

export class AgentBridge {
  /**
   * @param {object} options
   * @param {string} [options.endpoint]
   * @param {(event: object) => void} [options.onEvent]
   * @param {(connected: boolean) => void} [options.onConnection]
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || '/api/agents/stream';
    this.onEvent = options.onEvent || (() => {});
    this.onConnection = options.onConnection || (() => {});

    /** @type {EventSource|null} */
    this.eventSource = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8;
    this.reconnectDelay = 2000;
  }

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(this.endpoint);

    this.eventSource.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.onConnection(true);
    };

    this.eventSource.onerror = () => {
      this.connected = false;
      this.onConnection(false);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts += 1;
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.eventSource.addEventListener('AGENT_EVENT', (e) => {
      try {
        const payload = JSON.parse(e.data);
        this.onEvent(payload);
      } catch (err) {
        console.warn('[AgentBridge] Failed to parse event', err);
      }
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
}
