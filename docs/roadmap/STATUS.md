# Docs Autopilot — Status

Updated by each docs-autopilot wave. Orchestrator reads this before code waves.

## Gates

| Gate            | Value   | As of       |
| --------------- | ------- | ----------- |
| `DOCS_COMPLETE` | `yes`   | 2026-08-31  |
| `APP_COMPLETE`  | `no`    | 2026-08-31  |

## Phase

- **Current:** Wave A pass 1 complete (analyst scope A3–A4).
- **Next:** Wave B — `REQUIREMENTS.md`, `MASTER_ROADMAP.md`, code-vs-spec gap audit.
- **Blocked:** Implementation waves until `DOCS_COMPLETE=yes` (satisfied).

## Wave A pass 1 summary (A3–A4)

- Rewrote `docs/09-ui-spec.md` for OpenUI `ProjectShell` / `AgentInterface` (Stage D).
- Reconciled `docs/15-engineering-conventions.md` with `eslint.config.mjs` and sandbox gate.
- Added `AGENTS.md` **Current phase** block.
- Created `DOC_GAPS.md`, `DOC_RESOLUTIONS.md`, `docs/glossary.md`.

## Open non-blocking doc debt

See `DOC_GAPS.md` ⚠️ / ℹ️ rows — Deployer prompt (T3), barrel-only ESLint rule (T2),
shared Modal/Toast, `/agents` screen (MVP-2), `MASTER_ROADMAP` (Wave B).

## How to run

```bash
cp .env.example .env   # if missing
docker compose up
docker compose exec app yarn verify
```
