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
2. Add `?demo=1` to enable demo mode with simulated agent activity
3. Use command card to control workers (Stop, Hold, Resume, etc.)

## Commands

| Command | Hotkey | Description |
|---------|--------|-------------|
| Stop | S | Halt current task |
| Hold | H | Pause without canceling |
| Resume | R | Continue paused task |
| Assign | A | Reassign to new task |
| Inspect | I | View agent details |
| Terminate | X | End agent session |

## Agent Event Schema

```typescript
interface AgentEvent {
  type: 'spawn' | 'task_start' | 'task_complete' | 'error' | 'terminate';
  agentId: string;
  timestamp: string; // America/Chicago timezone
  data: {
    task?: string;
    tokens?: number;
    region?: 'goldmine' | 'lumber' | 'townhall' | 'ground';
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
