# BlazeCraft UI/UX + Ops Wiring Audit (2025-02-14)

## Current Observations (from repo + deployed HTML)

### Routing / pages
- The deployed app is a **single-page static experience** (no client routing detected). All tested paths (`/`, `/ops`, `/health`, `/status`, `/dashboard`) return the same HTML shell.
- No React router or SPA route definitions exist in the codebase; the UI is implemented in vanilla JS modules.

### UI surface areas (index.html)
- **Welcome overlay** (first-time visitor intro + demo toggle).
- **Top resource bar** with tasks completed, files modified, active workers, failed tasks, tokens.
- **Center map** (canvas) and **Event Log** right panel.
- **Bottom HUD** with portrait panel, minimap panel, ops feed, and command grid.
- **Auxiliary systems**: tooltips, loading overlay, magical wisp particles, film grain overlay.

### Core runtime modules
- **Game state + rendering**: `GameState`, `Renderer`, `UIPanels` drive the map, HUD, log, and selection behavior.
- **Worker simulation**: `MockBridge` generates worker events, tasks, and stats.
- **Ops wiring**: `OpsBridge` supports SSE + health/metrics polling, but is instantiated in demo mode by default.

### Ops health + metrics
- A Cloudflare Worker (`bsi-ops-bridge`) exists to aggregate health and metrics, exposing:
  - `GET /api/ops/stream` (SSE)
  - `GET /api/ops/health-all`
  - `GET /api/ops/metrics`
- The Worker currently targets a real health endpoint at `https://blazesportsintel.com/api/admin/health` for `bsi-home` and uses Chicago timestamps.

### Gaps to “real” wiring
- **Front-end is hard-coded to demo mode** for the ops bridge, so real SSE/health metrics are never used.
- **Worker tasks and agent activity are fully mocked** (`MockBridge`); there is no integration path to Claude Code / Codex workers.
- There is no authentication or secure session wiring for real agent or health data.

## Immediate Upgrade Game Plan

### 1) Live Ops feed (Health + Metrics)
**Goal:** Use real-time health/metrics from the Ops Bridge worker in the UI.

- **Front-end**: Flip `OpsBridge` to run in live mode by default with clear fallback to demo if health/SSE fails.
- **Worker**: Confirm health endpoint access to `blazesportsintel.com` and add status/latency for external APIs.
- **UI**: Surface connection state (Connected / Degraded / Offline) with clear CTA for retry.

**Acceptance checks**
- SSE stream receives events from `/api/ops/stream` and updates the ops feed + alerts.
- Metrics panel reflects real values (`gold/lumber/food/upkeep`) from `/api/ops/metrics`.

### 2) Real agent wiring (Claude Code + Codex)
**Goal:** Replace `MockBridge` with a real Agent Bridge that connects to actual worker sessions.

- **Define a Worker API contract** for agent events (spawn, progress, completion, error) and metadata (task, tokens, files changed, logs).
- **Implement an `AgentBridge`** module parallel to `MockBridge` with:
  - `connect()` to SSE or WebSocket agent stream
  - `sendCommand()` for stop/hold/resume/reassign/terminate
  - deterministic mapping to `GameState` fields
- **Security**: add auth tokens + allowlist; do not expose private agent streams publicly.

**Acceptance checks**
- Agents in UI match live Claude Code session data (task names, progress, tokens, file counts).
- Commands invoke real agent actions and update the UI state.

### 3) Route strategy
**Goal:** Introduce real routes for Ops and Agent views.

- `/` -> RTS dashboard (current default)
- `/ops` -> Ops-only feed and service health grid
- `/agents` -> Agent list with per-agent detail drawer

If staying static, use path-based routing handled in JS + history API to avoid a framework shift.

### 4) Data quality + compliance (sports focus)
- For any sports data views: enforce MLB > NCAA Baseball > NCAA Football > NFL > NBA ordering and **exclude soccer**.
- All timestamps must be America/Chicago.
- Provide citations to official APIs with confidence intervals; do not fabricate data.

### 5) Visual polish + UX
- Add a “connection health” badge that aggregates ops + agent stream status.
- Add “last updated” timestamps to logs and stats.
- Provide keyboard shortcuts for command grid (map to existing hotkeys).

## Readiness Risks
- **No React**: the UI is not React-based; any assumptions about React components must be avoided.
- **Mock data**: most of the core UI uses simulation; wiring real services will require API design and auth.
- **Ops Bridge live mode** currently unused by the UI; needs a minimal switch + error handling to go live.

## Verification Matrix
- **Routes**: `/`, `/ops`, `/health`, `/status`, `/dashboard` → same HTML shell.
- **Demo mode**: OpsBridge demo mode is currently enabled, bypassing real SSE/health.
- **Agent data**: `MockBridge` generates simulated workers (no real Claude/Codex wiring yet).

