# Docs Autopilot — Status

Updated by each docs-autopilot wave. Orchestrator reads this before code waves.

## Gates

| Gate            | Value | As of      |
| --------------- | ----- | ---------- |
| `DOCS_COMPLETE` | `yes` | 2026-08-31 |
| `APP_COMPLETE`  | `no`  | 2026-08-31 |

## Phase

- **Current:** Wave C2 complete (MVP-3 D1 Full Reviewer UI); C1 Self-Refine + A1–B4 foundation intact.
- **Next:** Wave C3 — MVP2-43-DOMAIN (Traefik deploy), MVP3-C2 (AgentMemory), root README, dogfood closure.
- **Blocked:** `APP_COMPLETE` — 20 open requirements in `REQUIREMENTS.md`.

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

## Wave C2 summary (2026-08-31)

- Implemented MVP-3 D1: Full Reviewer verdict UI.
- `ReviewIssueList.tsx` — issues list with severity badges, file:line, collapse after 5.
- `ReviewVerdictCard.tsx` — confidence badge, auto-approve badge (threshold 0.85), issues list.
- `parse-review.ts` — `ReviewIssue` type, `issues[]`, `AUTO_APPROVE_THRESHOLD`, `isAutoApproved()`.
- 8 new tests (parse-review.test.ts). `yarn verify` green (419 tests).
- `REQUIREMENTS.md`: MVP3-D1 → done, MVP2-41-UI → partial (needs automated UI test).

- Implemented MVP-3 C1: Reviewer Self-Refine loop (retry cap 3).
- Integrated MVP-3 A1–A4 + B1–B4 from prior cloud-agent branches (idempotency, audit, policy, Langfuse, evals, red-team).
- `yarn verify` green (412 tests).

## Next implementation milestones

1. **MVP2-43-DOMAIN** — Traefik/nginx + real deploy URL.
2. **MVP3-C2** — `AgentMemory` model + prompt mixing.
3. **MVP2-53-README** — root README for first users.
4. **Slim MVP-1 closure** — recorded dogfood evidence (`MVP1-R01`, `MVP1-R05`).

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
