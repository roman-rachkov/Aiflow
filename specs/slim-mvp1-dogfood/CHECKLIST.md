# Task I4 — Narrow E2E dogfood checklist (slim MVP-1)

## Goal

Validate the slim MVP-1 path once without full self-dogfood (5.1) or load
testing (5.2). Those stay in MVP-2.

## Path to exercise

1. `docker compose up` (postgres, redis, minio, gitea, app, worker, registry-proxy).
2. Build sandbox image (once):
   `docker build -t aistudio/aider-sandbox:latest -f docker/aider-sandbox/Dockerfile docker/aider-sandbox`
3. Sign in (dev user), create a project, run Researcher → approve SPEC.md.
4. Open `/projects/{id}/tasks` → **Сгенерировать план** (`plan:generate`).
5. On a PENDING task → dry-run execute → confirm live `code:execute`.
6. Watch WS logs; expect DONE + commit on task branch, or FAILED with TaskLog.
7. Optional: Pro editor review → Deployments **Сборка** (`deploy:run`).

## Smoke artifacts in this repo

| Slice       | Spec / plan                     |
| ----------- | ------------------------------- |
| 3.1 Sandbox | `specs/task-3.1-sandbox-infra/` |
| 3.2 Planner | `specs/task-3.2-planner/`       |
| 3.3 Coder   | `specs/task-3.3-coder/`         |

## Out of scope (MVP-2)

LLM Reviewer, Support Bot, Traefik/domain URL, full AI Studio self-build, 3-project load test.

## Status

Checklist ready 2026-08-07. Live compose dogfood run is operator-driven (needs
Docker daemon + LLM keys); automated coverage is unit tests for plan parse,
queue payloads, dry-run handler, sandbox options, and registry allowlist.
