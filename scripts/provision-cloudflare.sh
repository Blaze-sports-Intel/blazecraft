#!/usr/bin/env bash
set -euo pipefail

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is required on PATH." >&2
  exit 1
fi

export KV_JSON
export KV_PREVIEW_JSON
export D1_JSON
export D1_PREVIEW_JSON

KV_JSON="$(wrangler kv:namespace create BLAZECRAFT_CACHE --json)"
KV_PREVIEW_JSON="$(wrangler kv:namespace create BLAZECRAFT_CACHE --preview --json)"
D1_JSON="$(wrangler d1 create blazecraft-historical --json)"
D1_PREVIEW_JSON="$(wrangler d1 create blazecraft-historical-preview --json)"

python <<'PY'
import json
import os
import pathlib

kv_json = json.loads(os.environ["KV_JSON"])
kv_preview_json = json.loads(os.environ["KV_PREVIEW_JSON"])
d1_json = json.loads(os.environ["D1_JSON"])
d1_preview_json = json.loads(os.environ["D1_PREVIEW_JSON"])

def read_id(payload, key):
  value = payload.get(key)
  if not value:
    raise SystemExit(f"Missing {key} in wrangler output.")
  return value

kv_id = read_id(kv_json, "id")
kv_preview_id = read_id(kv_preview_json, "id")
d1_id = read_id(d1_json, "uuid")
d1_preview_id = read_id(d1_preview_json, "uuid")

path = pathlib.Path("wrangler.toml")
text = path.read_text()
replacements = {
  "__BLAZECRAFT_CACHE_ID__": kv_id,
  "__BLAZECRAFT_CACHE_PREVIEW_ID__": kv_preview_id,
  "__BLAZECRAFT_D1_ID__": d1_id,
  "__BLAZECRAFT_D1_PREVIEW_ID__": d1_preview_id,
}
for key, value in replacements.items():
  text = text.replace(key, value)
path.write_text(text)
print("Updated wrangler.toml bindings.")
PY

wrangler r2 bucket create blazecraft-historical
wrangler r2 bucket create blazecraft-historical-preview

echo "Provisioning complete."
