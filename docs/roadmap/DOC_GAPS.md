# Documentation Gaps — Wave A Pass 1 (Analyst A1–A2)

Tracked gaps in `docs/01`–`04`, `10`–`12`, `14` against live compose,
`docs/16-code-map.md`, and ADR tables. Severity: 🔴 blocks implementation
understanding · ⚠️ misleads but workaround exists · ℹ️ polish / Wave B.

| id | severity | status | summary | file refs |
| --- | --- | --- | --- | --- |
| GAP-001 | 🔴 | fixed | Queue names used BullMQ-invalid `:` form (`plan:generate`) instead of live hyphen names (`plan-generate`) | `02-architecture.md` §2.2, §4; `10-infrastructure.md` YAML; `11-sandbox.md` |
| GAP-002 | 🔴 | fixed | Architecture doc listed four queues; live worker runs six (`spec-generate`, `plan-generate`, `code-execute`, `code-review`, `deploy-run`, `chat-run`); `spec-generate` dormant (SPEC via chat tool) | `02-architecture.md` §2.2 |
| GAP-003 | 🔴 | fixed | `01-system-spec.md` §5 still described full MVP-1 (Reviewer, Support Bot, domain deploy) — contradicts slim MVP-1 (OQ #7–#8) | `01-system-spec.md` §3 F5–F7, §5, §7 |
| GAP-004 | 🔴 | fixed | `03-data-model.md` omitted `ChatThread` and `threadId`/`parentId` on `ChatMessage` (shipped D0b) | `03-data-model.md` §3 |
| GAP-005 | 🔴 | fixed | Codegen lifecycle §4 assumed LLM Reviewer in the product path; slim MVP-1 gate = sandbox checks only | `02-architecture.md` §4 |
| GAP-006 | 🔴 | fixed | Auth stack table listed Email/OAuth; MVP ships Credentials only (B3) | `02-architecture.md` §7 |
| GAP-007 | 🔴 | fixed | Gitea prose said `SPEC.md` at repo root; user repos use `specs/SPEC.md` (B1); platform reads DB | `02-architecture.md` §2.3 |
| GAP-008 | 🔴 | fixed | Duplicate section numbers in roadmap (two §5, two §6) | `04-roadmap.md` |
| GAP-009 | 🔴 | fixed | OQ #4 prod replacement for `docker.sock` undefined — blocked prod packaging narrative | `12-open-questions.md` #4; `DOC_RESOLUTIONS.md` RES-004 |
| GAP-010 | 🔴 | fixed | OQ #9 escalation policy blocked router design guidance | `12-open-questions.md` #9; `DOC_RESOLUTIONS.md` RES-009 |
| GAP-011 | ⚠️ | open | `10-infrastructure.md` aspirational YAML still shows `postgres:16-alpine`; live compose uses `pgvector/pgvector:pg16` | `10-infrastructure.md` YAML; root `docker-compose.yml` |
| GAP-012 | ⚠️ | open | `02-architecture.md` chat long-work path not fully rewritten for `chat-run` worker + Redis→SSE (D0g) — errata added, full prose deferred | `02-architecture.md` §2.1; `15-engineering-conventions.md` §7 |
| GAP-013 | ⚠️ | open | Inline colon queue aliases remain in historical task shipped notes (`plan:generate`, `deploy:run`) | `04-roadmap.md` §2.2, §3.2 |
| GAP-014 | ⚠️ | open | Prompt docs (`06`–`08`) still cite colon queue names — out of A1–A2 scope; Wave B or prompt pass | `06-prompt-planner.md`, `08-prompt-reviewer.md` |
| GAP-015 | ℹ️ | open | `MASTER_ROADMAP.md` absent — MVP-2/MVP-3 tasks mapped in `04-roadmap.md` §4–§5 only | Wave B |
| GAP-016 | ℹ️ | open | `docs/README.md` has no index row for `glossary.md` or `roadmap/` | Wave B |
| GAP-017 | ℹ️ | open | `09-ui-spec.md` tasks-route stub note predates shipped Planner/Tasks UI | `09-ui-spec.md` (Wave B / UI pass) |

## MVP phase mapping (04-roadmap → implementation)

| Phase | Section | Tasks | Code-map / compose anchor |
| --- | --- | --- | --- |
| MVP-0 | §2 | 1.1–1.3, 2.1–2.3 | `16-code-map.md` features auth…deploy |
| Slim MVP-1 | §3 | 3.1–3.3 | `docker/aider-sandbox/`, worker `code/`, `plan/` |
| MVP-2 | §4 (= §3.3 deferred) | 4.1–4.3, 5.1–5.3 | `code-review` partial; Support Bot, Traefik, dogfood open |
| MVP-3 | §5 | A1–A4, B1–B4, C1–C4, D1–D4 | Stubs only; decisions E1–E4 in `14-decisions-needed.md` |

## Counts (after pass 1 fixes)

| Severity | total | open | fixed |
| --- | --- | --- | --- |
| 🔴 | 10 | 0 | 10 |
| ⚠️ | 4 | 4 | 0 |
| ℹ️ | 3 | 3 | 0 |
