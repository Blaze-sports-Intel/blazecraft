# BlazeCraft - AI Agent Command Center

## What It Is

BlazeCraft is a real-time strategy (RTS) style visualization tool for monitoring Claude Code agents and workers. Inspired by classic RTS game interfaces, it provides a game-like command center for observing and controlling AI agent sessions.

## Architecture

- **Pure vanilla JavaScript** (ES6 modules)
- **No build step**, no dependencies
- **Canvas-based rendering** with hardware acceleration
- **Pub/sub state management** via GameState

## Key Components

| File | Purpose |
|------|---------|
| `scripts/main.js` | Entry point, game loop, event handling |
| `scripts/game-state.js` | Centralized state store |
| `scripts/renderer.js` | Canvas map and minimap rendering |
| `scripts/ui-panels.js` | Panel updates (portrait, log, commands) |
| `scripts/commands.js` | Worker command execution |
| `scripts/mock-data.js` | Demo mode data generation |

## Integration with BSI

BlazeCraft is part of the Blaze Sports Intel platform:

| Property | Value |
|----------|-------|
| Domain | `blazecraft.app` |
| Cloudflare Pages Project | `bsi-agentforge` |
| GitHub Repository | `Blaze-sports-Intel/blazecraft` |

## Design System

BlazeCraft uses BSI design tokens:

```css
--bsi-bg-primary: #0d0d0d;      /* Midnight */
--bsi-bg-secondary: #1A1A1A;    /* Charcoal */
--bsi-accent: #E86C2C;          /* Blaze Orange */
--bsi-text: #F5F5F5;
--bsi-text-muted: #888888;
```

## Usage

1. Open `blazecraft.app`
2. Demo mode shows simulated agent activity
3. Live mode connects to production event streams by default
4. Append `?demo=1` or `?bridge=mock` to force demo mode
5. Append `?transport=ws` to force WebSocket instead of SSE
6. Use command card to control workers (Stop, Hold, Resume, etc.)

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Stop | S | Halt current task |
| Hold | H | Pause without canceling |
| Resume | R | Continue paused task |
| Assign | A | Reassign to new task |
| Inspect | I | View agent details |
| Terminate | X | End agent session |

## Production Event Streams

### Connection URLs (Production)

| Transport | URL |
|-----------|-----|
| SSE | `https://blazecraft.app/api/agent-stream` |
| WebSocket | `wss://blazecraft.app/api/agent-stream` |
| Command POST | `https://blazecraft.app/api/agent-command` |

### Agent Event Schema (Production)

All timestamps must be in **America/Chicago** with an explicit offset (`YYYY-MM-DDTHH:mm:ss-05:00` or `-06:00`).

```typescript
type WorkerStatus = 'idle' | 'working' | 'moving' | 'blocked' | 'complete' | 'terminated' | 'hold';
type EventType = 'spawn' | 'task_start' | 'task_complete' | 'error' | 'terminate' | 'command' | 'status';

interface SourceAttribution {
  name: string;
  url: string;
  confidence: number; // 0..1
  confidenceInterval: [number, number]; // 0..1
}

interface WorkerPayload {
  id: string;
  name: string;
  status: WorkerStatus;
  currentTask: string | null;
  targetRegion: 'goldmine' | 'lumber' | 'townhall' | 'ground';
  position: { x: number; y: number };
  spawnedAt: string;
  updatedAt: string;
  tokensUsed: number;
  progress: number;
  errorMessage: string | null;
  source?: SourceAttribution;
}

interface StreamEnvelope {
  type: 'worker.upsert' | 'worker.remove' | 'event' | 'stats' | 'scout';
  timestamp: string;
  data:
    | { worker: WorkerPayload }
    | { workerId: string }
    | { event: { type: EventType; workerId: string; details: string } }
    | { completed: number; files: number; failed: number; tokens: number }
    | { line: string };
}

interface CommandAssignPayload {
  type: 'command.assign';
  timestamp: string;
  timestampMs: number;
  data: {
    workerIds: string[];
    regionId: string;
    regionName: string;
  };
}
```

## Development

```bash
# Serve locally (any static server)
npx serve .

# Or Python
python -m http.server 8000
```

No build step required - just serve the static files.

## Deployment

Push to `main` branch triggers GitHub Actions workflow that deploys to Cloudflare Pages.

```bash
git push origin main
```

The site will be available at:
- Production: `https://blazecraft.app`
- Preview: `https://<branch>.bsi-agentforge.pages.dev`
