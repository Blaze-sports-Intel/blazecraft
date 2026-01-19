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
- Demo mode (add `?demo=1`) for simulated agent activity

## Tech Stack

- Pure ES6 modules (no build step)
- Canvas API for rendering
- Pub/sub state management
- Cloudflare Pages hosting

## Development

```bash
# Serve locally
npx serve .

# Or Python
python -m http.server 8000
```

Open `http://localhost:8000` (or port 5000 for serve).

## Deployment

Push to `main` deploys automatically via GitHub Actions to Cloudflare Pages.

## Part of Blaze Sports Intel

BlazeCraft is a component of the [Blaze Sports Intel](https://blazesportsintel.com) platform.

## License

MIT
