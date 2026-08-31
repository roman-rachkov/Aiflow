# AI Studio — Glossary

User-facing Russian terms (product copy), English code identifiers, and
one-line technical definitions. ADR precedence is listed for conflict resolution.

## ADR hierarchy (highest wins)

1. [`14-decisions-needed.md`](14-decisions-needed.md) resolved table + § A–E
2. [`12-open-questions.md`](12-open-questions.md) status table
3. [`04-roadmap.md`](04-roadmap.md) — MVP phases and task status
4. [`02-architecture.md`](02-architecture.md) — component topology
5. [`10-infrastructure.md`](10-infrastructure.md) / [`11-sandbox.md`](11-sandbox.md)
   — partly aspirational YAML; live dev = root `docker-compose.yml`
6. [`01-system-spec.md`](01-system-spec.md) — product intent (overview)
7. Prompts [`05`](05-prompt-analyst.md)–[`08`](08-prompt-reviewer.md)
8. [`09-ui-spec.md`](09-ui-spec.md) — screens and flows

Operational truth for paths and queues: [`16-code-map.md`](16-code-map.md) +
repo root compose file.

---

## Personas and UI modes

| RU (user-facing) | Code / doc EN | One-liner |
| --- | --- | --- |
| Заказчик / «тётя Зина» | Customer | Non-technical user; BASIC mode default |
| Инженер / «дядя Вася» | Engineer | Technical user; PRO mode (`User.uiMode`) |
| Pro-режим | `UiMode.PRO` | Unlocks editor, model config, planner/coder tools |
| Базовый режим | `UiMode.BASIC` | Chat + SPEC + deploy; no manual editor |

`User.role` (OWNER/ADMIN/USER) is authorization for future admin — not the Customer/Engineer split.

---

## AI roles (internal, English in prompts)

| Role | RU in UI (examples) | Queue / trigger |
| --- | --- | --- |
| Analyst | Аналитик, чат | `chat-run` tool `spec:generate` |
| Planner | Планировщик | `plan-generate` |
| Coder | Кодер | `code-execute` → sandbox |
| Reviewer | Ревьюер | `code-review` (MVP-2+ product) |
| Deployer | Деплой | `deploy-run` |

---

## Core artifacts

| Term | Location | One-liner |
| --- | --- | --- |
| SPEC.md | DB `Specification` (+ Gitea copy) | Versioned requirements; section headings EN, body user language |
| User repo SPEC | `specs/SPEC.md` in generated Gitea repo | Copy for version control alongside code |
| Platform SPEC draft | `specs/{slug}/SPEC.md` in monorepo | B1 directory layout for design artifacts |
| Task branch | `task/{id}-{slug}` | Git isolation per Coder task |
| Sandbox gate | `docker/aider-sandbox/runner-checks.js` | Fatal tsc/eslint/prettier/prisma validate |

---

## Infrastructure (dev compose)

| Term | Value / path | One-liner |
| --- | --- | --- |
| App | `:3000` | Next.js + API + WS proxy; stateless |
| Gitea (browser) | `:3002` → container `:3000` | One Git repo per project |
| model-router | `:3001` | OpenAI-compatible provider router (stub OK for MVP) |
| registry-proxy | internal `:3128` | CONNECT allowlist for sandbox egress |
| Project DB schema | `project_{uuid}` | Platform tables per tenant |
| User app DB schema | `app_{hex}` | Deploy-time `prisma db push` target |
| API key to sandbox | `/run/secrets/api_key` | Read-only file mount, never env |
| docker.sock | worker mount | **DEV-ONLY** — RES-004 |
| Node dev image | `node:22-bookworm` | Stock image, bind mount, no `build:` |
| Postgres image | `pgvector/pgvector:pg16` | pgvector for RAG embeddings |

---

## Queues (canonical hyphen names)

`spec-generate` (dormant stub) · `plan-generate` · `code-execute` ·
`code-review` · `deploy-run` · `chat-run`

---

## MVP phases (roadmap shorthand)

| Phase | Scope |
| --- | --- |
| MVP-0 | Auth, projects, chat, RAG, SPEC, editor, manual deploy |
| Slim MVP-1 | Planner + sandbox Coder; gate = sandbox checks |
| MVP-2 | LLM Reviewer product path, Support Bot, domain deploy, dogfood/load |
| MVP-3 | Agent maturity: idempotency, Langfuse, Self-Refine, escalation (C3) |

---

## Cross-links

- Gap tracker: [`roadmap/DOC_GAPS.md`](roadmap/DOC_GAPS.md)
- Analyst decisions: [`roadmap/DOC_RESOLUTIONS.md`](roadmap/DOC_RESOLUTIONS.md)
- Doc completion: [`roadmap/STATUS.md`](roadmap/STATUS.md)
