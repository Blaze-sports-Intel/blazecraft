# BlazeCraft

AI Agent Command Center - RTS-style visualization for Claude Code agents.

## Overview

BlazeCraft provides a real-time strategy game interface for monitoring and controlling AI agent sessions. Built with vanilla JavaScript and Canvas rendering.

**Live**: [blazecraft.app](https://blazecraft.app)

## Features

- Real-time agent visualization on a map canvas
- Command card with hotkey support (Stop, Hold, Resume, Assign, Inspect, Terminate)
- Event log with live updates
- Minimap overview
- Agent portrait panel with status meters
- Demo mode for testing without live agents

## Tech Stack

- Pure ES6 modules (no build step)
- Canvas API for rendering
- Pub/sub state management
- Cloudflare Pages hosting

## Development

```bash
# Install dependencies (for testing)
npm install

# Serve locally
npx serve . -p 8080

# Or Python
python -m http.server 8080
```

Open `http://localhost:8080`.

## Testing

```bash
# Run smoke tests
npm test

# Or run with verbose output
npx playwright test --reporter=list
```

## Live vs Demo Mode

- **Demo Mode** (default): Simulates worker activity with randomly spawning agents, task completion, and metrics updates. No external connection required.
- **Live Mode**: Connects to BSI infrastructure for real-time monitoring. Requires the ops-bridge backend.

Toggle between modes using the "Demo" button in the top-right.

## Verifying Health

After deployment, check these indicators:

1. **Metrics Bar**: Top bar should show non-zero "Active Workers" count within a few seconds
2. **Event Log**: Right panel should populate with spawn/task events
3. **Ops Feed**: Bottom panel should show "Demo mode active" message
4. **Canvas**: Map should render with moving worker dots

Open browser console - there should be no errors on load.

## Troubleshooting

### Page loads but nothing happens
- Check browser console for errors
- Ensure JavaScript is enabled
- Try hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

### Metrics stuck at zero
- Verify demo mode is on (Demo button should be highlighted)
- Wait 3-5 seconds for initial workers to spawn
- Check that `scripts/main.js` loads without errors

### Event log empty
- Demo mode should populate events within 5 seconds
- Check for console errors related to `game-state.js`

### Commands don't work
- Most commands require selecting a worker first (click on map)
- "Scan" command works without selection
- Press 'Q' for scan or click the Scan button

## Deployment

Push to `main` deploys automatically via GitHub Actions to Cloudflare Pages.

Tests run before deployment - if tests fail, deployment is blocked.

## Part of Blaze Sports Intel

BlazeCraft is a component of the [Blaze Sports Intel](https://blazesportsintel.com) platform.

## License

MIT
