# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language policy — read this before writing anything

**Think and work in English. Reply to the user in their language.**

This is a cost measure, not a style preference. Russian tokenizes roughly 2–3× worse than English for the same content, and reasoning is the bulk of token spend. The rule applies at two levels:

_Here, in development:_

- Reasoning, planning, tool calls, search queries, commit messages, code comments, and agent-to-agent messages — **English**.
- Final answers to the user — **Russian** (that is the user's language in this project).
- `docs/*.md` is **English**, including role names. It was originally Russian and was translated wholesale for this reason. Keep it that way.

_In the product being built_ — the same split is a design requirement, not just a convention:

- Internal traffic between AI roles — the Planner's JSON task array, the Reviewer's verdict JSON, coder task descriptions, RAG queries — **English**.
- Anything the end user reads — the Analyst's interview questions, `SPEC.md` prose, error messages, UI strings — **the user's language**.
- `SPEC.md` is the boundary artifact: its section headings are fixed English (the Planner parses them), while the prose inside is in the user's language.

The prompts in `docs/05`–`08` have been translated to match. What remains open is enforcement — see T5 in `docs/13-agent-tooling.md`.

## Repository status

**Scaffolding is in progress.** The monorepo is laid out (`apps/web`, `apps/worker`, `services/`, `packages/`, `tools/`) with `package.json`, `yarn.lock`, `tsconfig.base.json`, `eslint.config.mjs`. A few services are still stubs — see the code map at `docs/16-code-map.md`.

`docs/` is the source of truth. `docs/README.md` is the index — read it first.

`docs/` was split out of two earlier drafts, `ide.md` and `ide-analize.md`. Those files are gone by design — they were superseded, not lost. `docs/12-open-questions.md:3` and `docs/README.md:3` still link to them; the links are dead and that is expected. Don't go looking for them.

## What is being built

**AI Studio** — a platform that takes a non-technical user's natural-language idea and produces a deployed web app without a developer: interview → `SPEC.md` → task decomposition → AI-generated code in Docker sandboxes → deploy.

Two personas drive every design decision: the **Customer** ("Aunt Zina", non-technical) and the **Engineer** ("Uncle Vasya"). Five internal AI roles: Analyst, Planner, Coder, Reviewer, Deployer.

## Stack decisions already made

These override what the older docs show. `docs/10-infrastructure.md` and `docs/11-sandbox.md` predate them and are partly stale — reconciling those files is part of the scaffolding task.

- **Yarn + Lerna**, not npm. The `npm ci` calls in the Dockerfiles are outdated.
- **Monorepo via Yarn workspaces**: `apps/web` (Next.js), `apps/worker` (BullMQ), `services/model-router`, `services/registry-proxy`, `packages/db` (Prisma + shared types), plus `packages/queue`, `packages/ai-roles`, `packages/ui`, and `tools/*` for dev-only tooling that ships nowhere. The flat `src/` + `prisma/` layout in the compose file is outdated.
- **Repo is private.** No LICENSE file; the license question is deferred until it opens.
- **Tailwind v4**, not v3. Tokens are declared in CSS (`@theme`) and there is no `tailwind.config.js`; the PostCSS plugin is `@tailwindcss/postcss`. Two traps: `outline-none` means `outline-style: none` in v4 (use `outline-hidden`), and automatic source detection is disabled via `source(none)` because on Windows it walks out of the repo — so **a new source directory needs an explicit `@source`** in `apps/web/src/app/globals.css` or its classes are silently missing from the CSS.

Full rationale and the list of affected paths: `docs/14-decisions-needed.md`.

## Keep this file current — it exists to prevent re-exploration

Every task should start from documented state, not from a fresh sweep of the repo. Searching the codebase to rediscover what was already decided is the most wasteful thing that happens in a long project: it burns tokens, it burns time, and it produces answers that are sometimes wrong.

So treat state files as part of the deliverable, updated in the same commit as the change:

| What changed                                       | Update                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| A decision was made or reversed                    | `docs/14-decisions-needed.md` — move it to the resolved table with the rationale |
| An architectural invariant, command, or convention | This file                                                                        |
| Directory layout, a new package or feature slice   | `docs/16-code-map.md`                                                            |
| A doc became stale because of a decision           | The stale-documents table in `docs/15-engineering-conventions.md` § 7            |
| An MCP server, skill, or subagent was tried        | `docs/13-agent-tooling.md` + the prompt test log                                 |
| An open question was settled                       | `docs/12-open-questions.md` status table                                         |

**`docs/16-code-map.md` exists and is maintained alongside the scaffolding — a stale map is worse than none.** It is the one file that makes "read, don't search" possible: for each package and feature slice, one line on what it owns, its public entry point, and what it depends on. Plus where the cross-cutting things live — auth, the Prisma client factory, the queue definitions, the encryption helpers. Kept to roughly a screen; a code map that needs scrolling is a code map nobody reads.

When you finish a task, the test is simple: could the next session act on this area without grepping for it? If not, the state files are behind.

## Engineering conventions

`docs/15-engineering-conventions.md` is the full specification. The parts you will hit immediately:

**One task, one branch, one PR, rebased.** `task/{id}-{slug}` off `main`; `main` stays linear. Rebase and fast-forward only — no merge commits, no squash. Push with `--force-with-lease`, never bare `--force`. Conventional Commits with a workspace scope: `feat(web): ...`.

**Feature-sliced inside `apps/web`.** `features/{slice}/{api,ui,model}` with a single `index.ts` public surface. Dependencies flow one way: `app/` → `features/` → `shared/` → `packages/`. Never import another slice's internals, and never put logic in `app/` — routing only.

**UI has two homes, and the split is load-bearing.** `packages/ui` (`@aiflow/ui`) owns **primitives and design tokens** — Button, Input/Field, Card, Spinner, plus `@aiflow/ui/styles/theme.css`. It knows nothing about this app. `apps/web/src/shared/ui` owns **app composition** — `AppHeader`, `SideMenu` — which encodes this app's routes and must not move into a shared package. Reach for a primitive before writing raw utilities, and use the semantic tokens (`text-fg-muted`, `border-border`, `bg-surface`) rather than raw `slate-*`. Note that `packages/ui` exists despite having one consumer, which conventions § 2.3 would forbid — a deliberate exception, argued in `docs/14-decisions-needed.md` § D0.

**Size limits are enforced, not advisory.** File ≤ 200 lines, function ≤ 50, complexity ≤ 10. Configured as ESLint `warn`, but `--max-warnings 0` in CI and the sandbox makes them blocking. Exemptions need an inline reason after `--`.

**Refactor at each roadmap task boundary**, timeboxed to 90 minutes, on a `chore/refactor-*` branch. Behaviour-preserving: if a test has to change, it is not a refactor. Refactor immediately, without waiting, on a third duplicate, an import cycle, or a file past 300 lines.

**`yarn verify`** reproduces the CI gate locally: typecheck, lint, format check, tests. Run it before marking anything done.

The quality gate is real: `--max-warnings 0` blocks lint failures, and Prettier is configured (`eslint-config-prettier` + `format`/`format:check` in `package.json`). Still open: `runner.js` has no commit call (`docs/11-sandbox.md`, Task 3.1).

## Commands

**Real now** (`package.json`), run with `yarn`:

| Command                                      | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `yarn verify`                                | The CI gate: typecheck → lint → format:check → test. Run before marking anything done    |
| `yarn typecheck` / `yarn lint` / `yarn test` | Individual gates. `typecheck` fans out via Lerna; `lint` and `test` run once at the root |
| `yarn format`                                | Fix formatting; `format:check` only reports                                              |

Or as slash commands: **`/verify`** runs the gate and reports the first failure, **`/task-start <id> <slug>`** opens a correctly-named branch with the roadmap checklist, **`/state-sync`** checks whether the state files below have fallen behind, **`/note <идея>`** captures an idea into `notes/` without interrupting the current task, **`/session-review [window]`** analyses the tool flow of recent sessions and writes a retrospective to `reports/`, **`/tool-scout <need>`** finds tooling for a need and returns a licence verdict per `docs/15` § 8.

Still _prescribed by the docs_ rather than runnable, cited so you can verify them:

| Command                                     | Purpose                              | Source                          |
| ------------------------------------------- | ------------------------------------ | ------------------------------- |
| `ENVIRONMENT=dev docker compose up --build` | Start the full stack                 | `docs/10-infrastructure.md:265` |
| `docker compose up --scale worker=3`        | Scale BullMQ workers                 | `docs/10-infrastructure.md:283` |
| `npx prisma migrate dev`                    | Migrate the `public` schema **only** | `docs/03-data-model.md:223`     |

Project schemas (`project_{uuid}`) are **not** migrated by `prisma migrate` — they are created from a generated SQL script derived from `schema_project_template.prisma` (`docs/03-data-model.md` § 8).

There is no CI configuration and that is deliberate: `docs/04-roadmap.md:159` specifies manual test/build runs for MVP, with Gitea Actions deferred.

## Architecture

Four component groups, all under Docker Compose. Details in `docs/02-architecture.md`; the invariants that span multiple documents:

**The Next.js app is stateless and never executes long work.** It serves the frontend, REST API, and WebSocket proxy, and it _enqueues_ — nothing more. Anything long-running belongs in a worker. This is the constraint most easily violated by accident.

**Four queues, one worker container each** (`docs/10-infrastructure.md:190`): `spec:generate`, `plan:generate`, `code:execute`, `deploy:run`. Concurrency is 1 per queue.

**Redis is disposable.** Task progress is checkpointed to `TaskLog` in Postgres, so losing Redis means workers resume from the log rather than losing work. Never make Redis the only home for state.

**Isolation runs on two axes.** _Data_ — one PostgreSQL schema per project (`project_{uuid}`); only `User`, `ProjectMeta`, `DeploymentMeta` live in `public`. _Network_ — the `sandbox` network is `internal: true`, so sandboxes reach nothing but `registry-proxy`.

**Sandboxes are ephemeral and locked down**, destroyed after every task. Aider runs headless at a pinned version.

**Secrets** are AES-256-GCM encrypted under `ENCRYPTION_KEY`.

The specifics of all three — the URL-rewriting trick, the container hardening flags, the encrypted value shape, and the codegen lifecycle — are in [`ai-studio-internals`](.claude/skills/ai-studio-internals/SKILL.md). Read it before touching compose, sandbox config, per-project DB access, or secret handling.

**`model-router`** (Express, port 3001) unifies routerai.ru / OpenAI / Anthropic / Ollama behind an OpenAI-compatible API, with a fallback chain and a 1-hour Redis response cache. It stores no keys — they arrive encrypted, are decrypted for the call, then wiped from memory.

Gitea holds one repo per project, with `SPEC.md` at the repo root so requirements are versioned alongside code.

## Conventions for generated application code → `/ai-studio-internals`

These rules govern code the _product_ generates, not code we write. Needed only when touching the Coder prompt. The full section is in [`ai-studio-internals`](.claude/skills/ai-studio-internals/SKILL.md).

## Port allocation → `/ai-studio-internals`

Host ports: 3000, 3001, 3002, 5432, 6379, 9000/9001. The Gitea 3000/3002 split and all details are in [`ai-studio-internals`](.claude/skills/ai-studio-internals/SKILL.md).

## One thing that will waste your time

**Referenced files that do not exist.** `docs/12-open-questions.md:3` links `../ide-analize.md`, and `docs/README.md:3` cites `ide.md` as the source document that was split up. Neither is in the repo. The full critique behind the open questions is unavailable — don't go looking.

## Unresolved architectural decisions

`docs/12-open-questions.md` tracks nine questions; #3 (`code:execute` concurrency) is Resolved 2026-08-02 — read the status table, not the intro. Check it before implementing sandboxing, Prisma migrations, queue concurrency, or secret passing — and update its status table when one is settled.

`docs/14-decisions-needed.md` is separate and more urgent: decisions that must be made _before_ scaffolding starts, because a late answer means rewriting code. Git identity, package manager, repo layout, and the SPEC.md storage question live there.

Two have the most immediate impact:

- **#3 — `code:execute` concurrency.** **Resolved 2026-08-02** — branch-per-task removed the premise, so parallel BullMQ pulls no longer corrupt shared Git state. Kept here only because the naive implementation is still tempting.
- **#8 — MVP-1 timeline.** The roadmap budgets 6 weeks for one engineer; the cited analysis says comparable scope usually takes 3–4 months.

## Agent tooling

`docs/13-agent-tooling.md` is the registry of MCP servers, skills, and subagents — both those used to _build_ AI Studio and those that may ship _inside_ it. Every entry carries a dual-use verdict (dev-time / product-time / both) and a test status.

Update it whenever you try a capability. The four role agents in `.claude/agents/` mirror the production prompts in `docs/05`–`08`, so using them here doubles as prompt testing — record results in the prompt test log at the bottom of that file. The other three (`classifier`, `doc-checker`, `lang-lint`) are ours and mirror nothing.

### Model tiering

Two slots. Paid (`sonnet`/`opus`, both → `coding`) runs the four role agents. Free (`haiku` → local Qwen in LM Studio) runs the mechanical read-only ones: `classifier`, `doc-checker`, `lang-lint`.

The aliases lie — `haiku` is not Anthropic Haiku, and the free slot fails loudly when LM Studio is down rather than falling back to paid. Full policy, rationale, and the caveat that end-to-end routing is still unverified: [`docs/13-agent-tooling.md`](docs/13-agent-tooling.md) § 5.
