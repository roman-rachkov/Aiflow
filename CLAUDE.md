# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language policy — read this before writing anything

**Think and work in English. Reply to the user in their language.**

This is a cost measure, not a style preference. Russian tokenizes roughly 2–3× worse than English for the same content, and reasoning is the bulk of token spend. The rule applies at two levels:

*Here, in development:*

- Reasoning, planning, tool calls, search queries, commit messages, code comments, and agent-to-agent messages — **English**.
- Final answers to the user — **Russian** (that is the user's language in this project).
- `docs/*.md` is **English**, including role names. It was originally Russian and was translated wholesale for this reason. Keep it that way.

*In the product being built* — the same split is a design requirement, not just a convention:

- Internal traffic between AI roles — the Planner's JSON task array, the Reviewer's verdict JSON, coder task descriptions, RAG queries — **English**.
- Anything the end user reads — the Analyst's interview questions, `SPEC.md` prose, error messages, UI strings — **the user's language**.
- `SPEC.md` is the boundary artifact: its section headings are fixed English (the Planner parses them), while the prose inside is in the user's language.

The prompts in `docs/05`–`08` have been translated to match. What remains open is enforcement — see T5 in `docs/13-agent-tooling.md`.

## Repository status

**This repo contains design documents only — there is no source code yet.** No `package.json`, no `Dockerfile`, no `docker-compose.yml`. Just `docs/` (14 Markdown files, Russian), `.claude/`, and `.idea/`.

The first implementation task is scaffolding the Next.js project per `docs/04-roadmap.md` § 2.2, Task 1.1. Until that exists, nothing in the "Commands" section below is runnable.

The docs are the source of truth. `docs/README.md` is the index — read it first.

`docs/` was split out of two earlier drafts, `ide.md` and `ide-analize.md`. Those files are gone by design — they were superseded, not lost. `docs/12-open-questions.md:3` and `docs/README.md:3` still link to them; the links are dead and that is expected. Don't go looking for them.

## What is being built

**AI Studio** — a platform that takes a non-technical user's natural-language idea and produces a deployed web app without a developer: interview → `SPEC.md` → task decomposition → AI-generated code in Docker sandboxes → deploy.

Two personas drive every design decision: the **Customer** ("Aunt Zina", non-technical) and the **Engineer** ("Uncle Vasya"). Five internal AI roles: Analyst, Planner, Coder, Reviewer, Deployer.

## Stack decisions already made

These override what the older docs show. `docs/10-infrastructure.md` and `docs/11-sandbox.md` predate them and are partly stale — reconciling those files is part of the scaffolding task.

- **Yarn + Lerna**, not npm. The `npm ci` calls in the Dockerfiles are outdated.
- **Monorepo via Yarn workspaces**: `apps/web` (Next.js), `apps/worker` (BullMQ), `services/model-router`, `services/registry-proxy`, `packages/db` (Prisma + shared types). The flat `src/` + `prisma/` layout in the compose file is outdated.
- **Repo is private.** No LICENSE file; the license question is deferred until it opens.

Full rationale and the list of affected paths: `docs/14-decisions-needed.md`.

## Commands

**None exist yet.** Do not search for a build script — there isn't one. The commands below are *prescribed by the docs* for the future implementation, cited so you can verify them:

| Command | Purpose | Source |
|---|---|---|
| `ENVIRONMENT=dev docker compose up --build` | Start the full stack | `docs/10-infrastructure.md:265` |
| `docker compose up --scale worker=3` | Scale BullMQ workers | `docs/10-infrastructure.md:283` |
| `npx prisma migrate dev` | Migrate the `public` schema **only** | `docs/03-data-model.md:223` |
| `npx tsc --noEmit` | Sandbox verification gate 1 | `docs/11-sandbox.md:152` |
| `npx eslint . --ext .ts,.tsx --max-warnings 0` | Sandbox verification gate 2 | `docs/11-sandbox.md:162` |

Project schemas (`project_{uuid}`) are **not** migrated by `prisma migrate` — they are created from a generated SQL script derived from `schema_project_template.prisma` (`docs/03-data-model.md` § 8).

There is no CI configuration and that is deliberate: `docs/04-roadmap.md:159` specifies manual test/build runs for MVP, with Gitea Actions deferred.

## Architecture

Four component groups, all under Docker Compose. Details in `docs/02-architecture.md`; the invariants that span multiple documents:

**The Next.js app is stateless and never executes long work.** It serves the frontend, REST API, and WebSocket proxy, and it *enqueues* — nothing more. Anything long-running belongs in a worker. This is the constraint most easily violated by accident.

**Four queues, one worker container each** (`docs/10-infrastructure.md:190`): `spec:generate`, `plan:generate`, `code:execute`, `deploy:run`. Concurrency is 1 per queue.

**Redis is disposable.** Task progress is checkpointed to `TaskLog` in Postgres, so losing Redis means workers resume from the log rather than losing work. Never make Redis the only home for state.

**Isolation runs on two axes.**

*Data* — one PostgreSQL schema per project (`project_{uuid}`), reached by string-replacing the connection URL: `baseUrl.replace('schema=public', \`schema=${schemaName}\`)` (`docs/03-data-model.md:185`). Clients are cached in a WeakMap. Only `User`, `ProjectMeta`, and `DeploymentMeta` live in `public`; everything else is per-project.

*Network* — the `sandbox` network is declared `internal: true`, so sandbox containers cannot reach Postgres, Redis, or Gitea. Their only egress is `registry-proxy`, which filters by `ALLOWED_HOSTS`.

**Sandboxes are ephemeral and locked down** (`docs/11-sandbox.md`): `ReadonlyRootfs: true`, `CapDrop: ['ALL']`, `no-new-privileges`, 512 MB, 1 CPU, tmpfs mounted `noexec,nosuid`. Destroyed after every task. Aider runs headless at a pinned version.

**`model-router`** (Express, port 3001) unifies routerai.ru / OpenAI / Anthropic / Ollama behind an OpenAI-compatible API, with a fallback chain and a 1-hour Redis response cache. It stores no keys — they arrive encrypted, are decrypted for the call, then wiped from memory.

**Secrets**: `ModelConfig.config` is AES-256-GCM encrypted under `process.env.ENCRYPTION_KEY` (32 bytes) and stored as `{"__encrypted__": "<base64>"}`.

**Codegen lifecycle** (`docs/02-architecture.md` § 4): user approves `SPEC.md` → `plan:generate` → planner emits atomic tasks into `code:execute` → coder worker clones from Gitea into a volume, runs Aider, then tsc + ESLint → success commits to Gitea; failure goes to the reviewer, which either re-queues with clarification or marks FAILED → after all tasks, `deploy:run`.

Gitea holds one repo per project, with `SPEC.md` at the repo root so requirements are versioned alongside code.

## Conventions for generated application code

The target stack is fixed — Next.js + Prisma + PostgreSQL only (`docs/01-system-spec.md:105`). Per `docs/07-prompt-coder.md`, code produced for user projects should follow:

- Next.js **App Router**: pages at `app/[resource]/page.tsx`, APIs as Route Handlers in `app/api/...`
- Components in `components/`, server actions in `lib/actions/`
- Strict TypeScript; type across the server/client boundary with `@prisma/client` types, avoid `any`
- Functional React components, Tailwind for styling
- Errors handled: try/catch in APIs, `error.tsx` for pages

## Port allocation

Host ports: **3000** Next.js app, **3001** model-router, **3002** Gitea, 5432 Postgres, 6379 Redis, 9000/9001 MinIO. Full explanation at `docs/10-infrastructure.md:274`.

Gitea listens on 3000 *inside* its container (its default) and publishes to 3002 on the host. So `GITEA_URL` is `http://gitea:3000` for inter-service calls, its healthcheck targets `localhost:3000` (runs inside the container), but `GITEA__server__ROOT_URL` is `http://localhost:3002/`. Both numbers are correct in their own context — don't "fix" one to match the other.

## One thing that will waste your time

**Referenced files that do not exist.** `docs/12-open-questions.md:3` links `../ide-analize.md`, and `docs/README.md:3` cites `ide.md` as the source document that was split up. Neither is in the repo. The full critique behind the open questions is unavailable — don't go looking.

## Unresolved architectural decisions

`docs/12-open-questions.md` tracks eight decisions, **all currently marked "Open"**. Check it before implementing sandboxing, Prisma migrations, queue concurrency, or secret passing — and update its status table when one is settled.

`docs/14-decisions-needed.md` is separate and more urgent: decisions that must be made *before* scaffolding starts, because a late answer means rewriting code. Git identity, package manager, repo layout, and the SPEC.md storage question live there.

Two have the most immediate impact:

- **#3 — `code:execute` concurrency.** The spec requires sandboxes to run sequentially per project, but BullMQ pulls tasks in parallel by default. Unresolved, and it will corrupt Git state if implemented naively.
- **#8 — MVP-1 timeline.** The roadmap budgets 6 weeks for one engineer; the cited analysis says comparable scope usually takes 3–4 months.

## Agent tooling

`docs/13-agent-tooling.md` is the registry of MCP servers, skills, and subagents — both those used to *build* AI Studio and those that may ship *inside* it. Every entry carries a dual-use verdict (dev-time / product-time / both) and a test status.

Update it whenever you try a capability. The four subagents in `.claude/agents/` mirror the production prompts in `docs/05`–`08`, so using them here doubles as prompt testing — record results in the prompt test log at the bottom of that file.
