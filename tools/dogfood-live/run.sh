#!/usr/bin/env bash
# Live dogfood orchestrator — requires Docker on the host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required for live dogfood" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Copy .env.example → .env and set LLM keys before live dogfood." >&2
  exit 1
fi

echo "[dogfood-live] starting compose stack…"
docker compose up -d

echo "[dogfood-live] seed dev user…"
docker compose exec -T app yarn workspace @aiflow/db seed:dev-user

echo "[dogfood-live] build sandbox image (once per machine)…"
docker build -t aistudio/aider-sandbox:latest -f docker/aider-sandbox/Dockerfile docker/aider-sandbox

echo "[dogfood-live] run live pipeline inside app container…"
docker compose exec -T -e DOGFOOD_LIVE=1 app yarn workspace @aiflow/web dogfood-live

echo "[dogfood-live] done — see specs/slim-mvp1-dogfood/EVIDENCE.md"
