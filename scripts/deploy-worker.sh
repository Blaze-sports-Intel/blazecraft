#!/usr/bin/env bash
set -euo pipefail

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is required on PATH." >&2
  exit 1
fi

if rg -n "__BLAZECRAFT_.*_ID__" wrangler.toml >/dev/null; then
  echo "wrangler.toml still contains placeholder binding IDs. Run scripts/provision-cloudflare.sh first." >&2
  exit 1
fi

npm test

wrangler d1 migrations apply blazecraft-historical
wrangler d1 migrations apply blazecraft-historical-preview

wrangler deploy
wrangler deploy --env preview
