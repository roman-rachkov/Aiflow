# Production deployment runbook (MVP2-53-PROD)

This document describes how to move from the dev Compose stack to a production-shaped
topology. It complements `docker-compose.prod.yml` (overlay) and OQ #4 in
`docs/12-open-questions.md` (no host `docker.sock` on workers in prod).

## What ships today

| Artifact                  | Purpose                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docker-compose.yml`      | Full dev stack (bind mounts, dev entrypoints)                                                            |
| `docker-compose.prod.yml` | Prod **overlay**: `ENVIRONMENT=prod`, worker volume reset, Traefik TLS command, model-router healthcheck |
| `yarn prod-check`         | Offline checklist: required env keys + overlay file presence                                             |
| OQ #4                     | Remote Docker API for sandboxes — documented, not wired                                                  |

Prod **images** (multi-stage Dockerfiles for app/worker) are deferred; the overlay
documents invariants until those images land.

## Prerequisites

1. Secrets store (Vault / cloud SM) for:
   - `ENCRYPTION_KEY` (32-byte base64)
   - `AUTH_SECRET`
   - `GITEA_ADMIN_TOKEN` or token file mount
   - LLM provider API keys (ModelConfig + router upstream)
2. Managed Postgres + Redis (or hardened self-host).
3. Remote Docker daemon for worker sandboxes (TLS), **not** `/var/run/docker.sock`.
4. TLS termination (Traefik or external LB) — see prod overlay `traefik` service.

## Deploy steps (when prod images exist)

```bash
cp .env.example .env
# Fill production values — never commit .env

docker compose -f docker-compose.yml -f docker-compose.prod.yml config  # validate merge
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Run migrations via app entrypoint (`migrate deploy` on `public` schema only).

## Verification

```bash
yarn prod-check          # offline env + file gate
yarn stabilization       # evals + load isolation + dogfood wiring smoke
curl -sf http://localhost:3001/health   # model-router (compose network)
```

## Worker sandbox egress

Sandboxes stay on the internal `sandbox` network; egress only via `registry-proxy`.
In prod, set worker `DOCKER_HOST` to the remote daemon (see comments in
`docker-compose.prod.yml`).

## Non-goals (this cutover)

- Gitea Actions CI (deferred in roadmap).
- HashiCorp Vault integration (documented only).
- Autoscaling — single-replica compose topology until k8s/swarm decision.
