# Docs Autopilot — Status

Updated by each docs-autopilot wave. Orchestrator reads this before code waves.

## Gates

| Gate            | Value | As of      |
| --------------- | ----- | ---------- |
| `DOCS_COMPLETE` | `yes` | 2026-08-31 |
| `APP_COMPLETE`  | `no`  | 2026-08-31 |

## Phase

- **Current:** Wave C6 complete — MVP3-C3 (model-router) + MVP3-C4 (Planner ToT) + ENG-UI-MT.
- **Next:** Wave C7 — MVP2-51 live dogfood, ENG-T02, MVP3-D4 stabilization.
- **Blocked:** `APP_COMPLETE` — 6 open + 4 partial in `REQUIREMENTS.md`.

## Wave C6 summary (2026-08-31)

- MVP3-C3: `services/model-router` Express runtime (`/health`, `/v1/chat/completions`,
  `/v1/escalate`); planner `callPlannerAdvisor` on retry exhaustion when
  `PLANNER_ADVISOR_MODEL` set.
- MVP3-C4: `planner-tot.ts` + `generatePlanTasksWithToT`; worker plan handler wired;
  `PLANNER_TOT_ENABLED` flag; eval smoke `tools/evals/src/score-tot.ts`.
- ENG-UI-MT: `@aiflow/ui` Modal + ToastNotice/ToastProvider; DeleteProjectButton +
  DeploymentsPanel migrated.
- MVP2-53-PROD partial: `docker-compose.prod.yml` overlay.
- `tools/dogfood-smoke/` + `yarn dogfood-smoke` — automated R01/R05 wiring evidence.
- `yarn verify` green (480 tests).

## Wave C5 summary (2026-08-31)

- Implemented MVP2-42-BOT + MVP2-42-COMPOSE + MVP3-D2: Support Bot with RAG.
- New feature slice `apps/web/src/features/support-bot/` (FSD):
  - `model/types.ts` — wire types (SupportChatRequest/Delta/Done)
  - `model/prompt.ts` — support bot system prompt (English internal, Russian user-facing)
  - `model/service.ts` — `streamSupportAnswer(schemaName, message, deps)` with dependency injection
    for `retrieveChunks` (boundaries/dependencies rule enforcement)
  - `ui/SupportBotPanel.tsx` — Pro-only chat panel with SSE streaming + source citation
  - `index.ts` — public barrel
- New API route `POST /api/projects/[id]/support/chat` — SSE streaming, auth guard, 404 on
  missing/foreign project; injects `retrieveChunks` from `features/files/rag`
- `SidebarNav.tsx` + `ProjectRoutes.tsx` updated: "Агенты" sidebar item (Pro only) with
  `SupportBotPanel` in `AgentInterface.Route path="agents"`
- `features/deploy/model/templates.ts` `renderDeployTemplates` now accepts
  `options.includeSupportBot`; `SUPPORT_BOT_ENABLED=true` env var appends `support-bot`
  sidecar service to generated compose file
- 4 unit tests in `service.test.ts` (stream output, RAG degradation, system prompt injection)

## Wave C4 summary (2026-08-31)

- Implemented MVP2-43-DOMAIN + MVP3-D3: Traefik v3 domain deploy.
- `apps/worker/src/deploy/run-container.ts`: `runDeployedContainer` with Traefik labels
  (`traefik.enable`, Host rule, entrypoint `web`, server port `3000`); idempotent
  (stop + remove existing container before create); `docker://` fallback when disabled.
- `handler.ts` extended: `runDeployedContainer` dep injected between build and db-push;
  real URL stored in `Deployment.url`; Russian log line "Запуск контейнера…".
- `docker-compose.yml`: Traefik v3 service (port 8090 HTTP, 8091 dashboard);
  worker env `DEPLOY_DOMAIN_ENABLED` / `DEPLOY_PUBLIC_BASE` / `TRAEFIK_NETWORK`.
- `.env.example`: `DEPLOY_DOMAIN_ENABLED=false` (opt-in), `DEPLOY_PUBLIC_BASE`.
- `run-container.test.ts`: 6 tests — shortHex, containerName, buildDeployUrl,
  fallback path, create+start, missing-container idempotence.
- `handler.test.ts` updated: `runDeployedContainer` mock + URL assertion.
- `yarn verify` green.

## Wave C3 summary (2026-08-31)

- Implemented MVP-3 C2: Persistent agent memory (Reflexion).
- `AgentMemory` model added to `schema_project_template.prisma` (taskId, role, lesson, timestamps, soft-delete).
- `packages/db/src/agent-memory.ts`: `storeLesson` / `retrieveLessons` backed by project Prisma client.
- `apps/worker/src/review/memory.ts`: `extractLesson(verdict, title)` + `storeLessonFromVerdict` helper.
- Reviewer handler: retrieves past lessons before `generateVerdict`, passes as `pastLessons`; stores lesson after verdict.
- `buildReviewUserPrompt` in `@aiflow/ai-roles`: includes `pastLessons` section when present.
- Coder pipeline (`pipeline-live.ts`): `buildSandboxDescription` retrieves lessons and prepends to task description.
- 17 new tests across `agent-memory.test.ts`, `memory.test.ts`, `handler.test.ts`, `reviewer.test.ts`.
- `yarn verify` green (436 tests).

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
