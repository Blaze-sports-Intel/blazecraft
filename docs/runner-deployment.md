# Agent Runner Deployment Guide

This guide covers deploying the BlazeCraft Agent Runner - the service that executes Claude Code jobs on a dedicated VM and streams results back to the gateway.

## Architecture Overview

```
[BlazeCraft UI] <---> [Agent Gateway (Cloudflare Worker)]
                              |
                              v
                    [Cloudflare Tunnel]
                              |
                              v
                    [Agent Runner VM]
                              |
                              v
                    [Claude Code CLI]
```

## Prerequisites

### Hardware/VM Requirements
- **OS**: Ubuntu 22.04 LTS or macOS 13+
- **RAM**: 8GB minimum (16GB recommended)
- **Disk**: 50GB+ SSD
- **Network**: Outbound HTTPS access

### Software Requirements
- Node.js 20+ (LTS)
- Git
- `cloudflared` CLI ([install guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

### Accounts/Credentials
- Cloudflare account with Zero Trust access
- Anthropic API key (for Claude Code)
- GitHub/GitLab access token (for repo cloning)

## Step 1: Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v  # Should show v20.x
npm -v

# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code
```

## Step 2: Configure Cloudflare Tunnel

### Create the tunnel
```bash
# Authenticate with Cloudflare
cloudflared tunnel login

# Create a new tunnel
cloudflared tunnel create blazecraft-runner

# Note the tunnel ID (UUID) from the output
# Example: Created tunnel blazecraft-runner with id abc123-def456-...
```

### Configure tunnel routing
Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/<USER>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: runner.blazecraft.app
    service: http://localhost:8787
  - service: http_status:404
```

### Add DNS record
```bash
cloudflared tunnel route dns blazecraft-runner runner.blazecraft.app
```

## Step 3: Deploy Agent Runner

```bash
# Clone the repo
git clone https://github.com/your-org/blazecraft-app.git
cd blazecraft-app/services/agent-runner

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Configure environment
Edit `.env`:
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
GATEWAY_SECRET=<shared-secret-with-gateway>
PORT=8787

# Optional
LOG_LEVEL=info
MAX_CONCURRENT_JOBS=3
JOB_TIMEOUT_MS=300000
```

## Step 4: Configure Gateway Secrets

The Agent Gateway needs to authenticate requests to/from the runner.

### Set gateway secrets (Cloudflare Workers)
```bash
cd workers/agent-gateway

# Set the shared secret
wrangler secret put RUNNER_SECRET
# Enter the same value as GATEWAY_SECRET from runner .env

# Set runner URL
wrangler secret put RUNNER_URL
# Enter: https://runner.blazecraft.app
```

## Step 5: Start Services

### Start the tunnel (background)
```bash
cloudflared tunnel run blazecraft-runner &
```

### Start the runner
```bash
cd services/agent-runner
npm start
```

### Or use systemd (recommended for production)

Create `/etc/systemd/system/blazecraft-runner.service`:
```ini
[Unit]
Description=BlazeCraft Agent Runner
After=network.target

[Service]
Type=simple
User=blazecraft
WorkingDirectory=/home/blazecraft/blazecraft-app/services/agent-runner
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable blazecraft-runner
sudo systemctl start blazecraft-runner
```

## Step 6: Enable Runner in Frontend

Update `src/config.js`:
```javascript
features: {
  liveMode: !getDemoMode(),
  runnerEnabled: true,  // Change from false to true
},
```

Deploy the frontend update to Cloudflare Pages.

## Verification Checklist

Run these checks after deployment:

### 1. Tunnel connectivity
```bash
curl https://runner.blazecraft.app/health
# Expected: {"status":"ok","version":"1.0.0"}
```

### 2. Gateway can reach runner
```bash
curl https://agent-gateway.your-domain.workers.dev/api/health/runner
# Expected: {"runner":"connected","latency_ms":...}
```

### 3. Create a test job
```bash
curl -X POST https://agent-gateway.your-domain.workers.dev/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"task","repo_ref":"test","command":"echo hello"}'
# Expected: {"id":"job_...","status":"pending",...}
```

### 4. Frontend job panel visible
1. Visit https://blazecraft.pages.dev
2. Job Panel should be visible in bottom HUD
3. Create a job and verify logs stream

## Troubleshooting

### Tunnel not connecting
```bash
# Check tunnel status
cloudflared tunnel info blazecraft-runner

# View tunnel logs
journalctl -u cloudflared -f
```

### Jobs stuck in pending
```bash
# Check runner logs
journalctl -u blazecraft-runner -f

# Verify Claude Code CLI works
claude-code --version
claude-code run "echo test"
```

### Gateway authentication errors
- Verify `RUNNER_SECRET` matches between gateway and runner
- Check Cloudflare Workers logs in dashboard

### SSE stream disconnecting
- Ensure Cloudflare settings allow WebSocket/SSE connections
- Check for proxy timeouts (increase if needed)

## Security Notes

- Never commit secrets to git
- Use Cloudflare Access to restrict tunnel access
- Rotate `GATEWAY_SECRET` periodically
- Runner VM should have minimal permissions
- Consider network isolation for the runner VM

## Related Documentation

- [Agent Gateway README](../workers/agent-gateway/README.md)
- [Agent Runner README](../services/agent-runner/README.md)
- [Cloudflare Tunnels Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Claude Code CLI Docs](https://docs.anthropic.com/claude-code)
