# Docs Autopilot — Status

Updated by each docs-autopilot wave. Orchestrator reads this before code waves.

## Gates

| Gate            | Value | As of      |
| --------------- | ----- | ---------- |
| `DOCS_COMPLETE` | `yes` | 2026-08-31 |
| `APP_COMPLETE`  | `no`  | 2026-08-31 |

## Phase

- **Current:** Wave B complete (code gap audit).
- **Next:** Wave C — Foundation implementation (A1, A2, B1, B2) + slim MVP-1 dogfood proof.
- **Blocked:** `APP_COMPLETE` — 30 open requirements in `REQUIREMENTS.md`.

## Wave B summary (2026-08-31)

- Created `REQUIREMENTS.md` (67 in-scope items: 33 done, 30 open, 4 forever-waive).
- Created `MASTER_ROADMAP.md` (phases + MVP-3 execution order + wave priorities).
- Created `DECISIONS.md` (Wave B autopilot decisions; references `DOC_RESOLUTIONS.md`).
- Evidence audit: MVP-0 + slim MVP-1 tasks done; MVP-2 partial (Reviewer one-shot);
  MVP-3 A1–D4 open; `model-router` stub; deploy URL `docker://` only.

## Wave A pass 1 summary (A3–A4)

- Rewrote `docs/09-ui-spec.md` for OpenUI `ProjectShell` / `AgentInterface` (Stage D).
- Reconciled `docs/15-engineering-conventions.md` with `eslint.config.mjs` and sandbox gate.
- Added `AGENTS.md` **Current phase** block.
- Created `DOC_GAPS.md`, `DOC_RESOLUTIONS.md`, `docs/glossary.md`.

## Wave C1 summary (2026-08-31)

- Implemented MVP-3 C1: Reviewer Self-Refine loop.
- `review/retry.ts`: `buildReviewFeedback`, `nextRetryCount`, `buildRetryPayload`, `handleRejectedVerdict`.
- `review/handler.ts`: REJECTED → `handleRejectedVerdict`; `enqueueCodeExecute` dep added.
- `code/pipeline-live.ts`: passes `retryCount` to review payload; appends `reviewFeedback` to sandbox description.
- `packages/queue`: `CodeExecutePayload` + `CodeReviewPayload` extended with retry fields.
- 5 new Self-Refine tests; 412 total passing. `yarn verify` green.

## Next implementation milestones

1. **Foundation** — A1 idempotent workers, A2 resumable pipeline, B1 Langfuse compose, B2 LLM tracing.
2. **Slim MVP-1 closure** — run `specs/slim-mvp1-dogfood/CHECKLIST.md` with recorded evidence.
3. **MVP-2 domain deploy** — Traefik/nginx + real URL (`MVP2-43-DOMAIN`).
4. **Agent wave** — C2 persistent memory, C3 escalation, D1 verdict UI.
5. **User docs** — root README when MVP-2 stabilizes.

See `MASTER_ROADMAP.md` for full dependency order.

## Open non-blocking doc debt

See `DOC_GAPS.md` ⚠️ / ℹ️ rows — Deployer prompt (T3), barrel-only ESLint rule (T2),
shared Modal/Toast, `/agents` screen (MVP-2).

## How to run

```bash
cp .env.example .env   # if missing
docker compose up
docker compose exec app yarn verify
```

## Continuity artifacts

| File                 | Purpose                            |
| -------------------- | ---------------------------------- |
| `REQUIREMENTS.md`    | Requirement registry with evidence |
| `MASTER_ROADMAP.md`  | Phase map + wave priorities        |
| `DECISIONS.md`       | Autopilot decision log             |
| `DOC_GAPS.md`        | Doc drift findings                 |
| `DOC_RESOLUTIONS.md` | Wave A mini-ADRs                   |
