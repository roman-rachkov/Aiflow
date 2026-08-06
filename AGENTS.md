# AGENTS.md

Quick-reference for any AI agent working in this repo. Pair it with [`CLAUDE.md`](CLAUDE.md)
(the full guidance) and `docs/` (the source of truth). When the two disagree, `CLAUDE.md`
and `docs/` win — update this file to match.

## What this is

**AI Studio** — a platform that turns a non-technical user's natural-language idea into a
deployed web app: interview → `SPEC.md` → task decomposition → AI-generated code in Docker
sandboxes → deploy. Yarn 4 + Lerna monorepo, private, no LICENSE (deferred). Classic
`node_modules` (PnP is off, see `.yarnrc.yml`).

Real packages today: `apps/web` (Next.js 15 App Router), `packages/db` (Prisma, two schemas),
`packages/ui` (design system), `tools/session-analyzer` (dev-only analytics).
Declared-but-empty stubs (do not assume they work yet): `apps/worker` (BullMQ),
`services/model-router`, `services/registry-proxy`, `packages/queue`, `packages/crypto`.
`packages/ai-roles` is now real (Task 1.3 / 2.1: OpenAI-compatible provider +
`createProviderFromEnv`). The code map
at `docs/16-code-map.md` tracks which is which — read it first.

**Dev stack:** `docker compose up` (no `--build`) starts the full topology —
postgres, redis, minio, gitea, app, worker, model-router, registry-proxy — on stock
images (`node:22-bookworm` for Node services). Bind-mount + named `node_modules`
volumes; entrypoint `docker/dev-entrypoint.sh`. Copy `.env.example` → `.env` first.

> Note: `docs/16-code-map.md` and `docs/17-session-review.md` exist on disk but are **not yet
> listed in `docs/README.md`**. The README also still links two deleted drafts (`ide.md`,
> `ide-analize.md`) — those dead links are by design, don't go looking.

## Tools available in this agent

Everything designed in `.claude/` works here — use it.

- **Slash commands** (`.claude/commands/`): `/verify` (run the CI gate), `/task-start <id> <slug>`
  (open a `task/{id}-{slug}` branch off `main`), `/state-sync` (are the state files behind?),
  `/note <idea>` (capture into `notes/` without breaking flow), `/session-review [7d|24h|30d|all]`
  (tool-flow retrospective → `reports/`), `/tool-scout <need>` (find MCP/skills/agents + licence verdict).
- **Subagents** (`.claude/agents/`): role agents `analyst`, `planner`, `coder`, `reviewer`;
  read-only mechanical ones `classifier`, `doc-checker`, `lang-lint`.
- **Skills** (`.claude/skills/`): **`ai-studio-internals`** — read before touching Docker Compose,
  sandbox config, per-project DB access, or secret handling. Plus `notes`.
- **MCP servers** (`.mcp.json`): `context7`, `aiflow-rag` (semantic search over docs +
  filtered source — prefer for concepts; Grep for exact symbols), `omniroute`.
  Reindex: `yarn workspace @aiflow/web docs:ingest` (needs Postgres + embeddings).
- **Hooks** (`hookify.*.local.md` in `.claude/`): prefer the dedicated Read/Grep/Glob tools over
  bash equivalents; `cd` is rewritten; destructive Prisma commands and false-success-after-`rm`
  are guarded; `WebFetch` may be unavailable.
- **Model tiering**: paid slot (`sonnet`/`opus` → coding) runs the four role agents; free slot
  (`haiku` → local Qwen in LM Studio) runs `classifier`/`doc-checker`/`lang-lint`. Aliases are
  not literal — full policy in `docs/13-agent-tooling.md` § 5.

## Quality gate (real, not advisory)

Run with `yarn`. `yarn verify` reproduces CI: typecheck → lint → format:check → test.

| Command                                                                                                         | Purpose                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn verify`                                                                                                   | The CI gate — run before marking anything done                                                                                                                                                        |
| `yarn typecheck` / `yarn lint` / `yarn test`                                                                    | Individual gates (`typecheck` fans out via Lerna; `lint`/`test` run at root)                                                                                                                          |
| `yarn format` / `yarn format:check`                                                                             | Prettier write / check only                                                                                                                                                                           |
| `apps/web`: `yarn dev`, `yarn build`                                                                            | Next.js (binds `0.0.0.0:3000` for compose); production build                                                                                                                                          |
| `apps/web`: `yarn docs:ingest`, `yarn rag:query`, `yarn rag:mcp`                                                | Stable dogfood RAG index + query CLI + MCP stdio server (`aiflow-rag` in `.mcp.json`)                                                                                                                 |
| `docker compose up`                                                                                             | Full dev stack — no `--build`. Copy `.env.example` → `.env` first                                                                                                                                     |
| `packages/db`: `yarn generate`, `yarn migrate`, `yarn migrate:deploy`, `yarn seed:dev-user`, `yarn project-sql` | Generate both Prisma clients; `migrate` = interactive `migrate dev`; `migrate:deploy` = non-interactive (compose entrypoint); **`public` schema only**; seed a local dev user; render per-project SQL |

`--max-warnings 0` makes the `warn` rules **blocking**: file ≤ 200 lines, function ≤ 50,
complexity ≤ 10, max-depth 4, max-params 4. Test files get a 400-line allowance; config /
migration / script files are exempt. `vitest.config.ts` sets `passWithNoTests: false` — a
workspace with zero tests fails loudly instead of looking green. Pre-commit (`husky` →
`lint-staged`) reformats and lints staged files.

## Architecture invariants (the ones most easily broken)

- **The Next.js app is stateless and never does long work.** It serves the frontend, REST API,
  and WebSocket proxy, and _enqueues_ — nothing more. Long-running work belongs in a BullMQ worker.
- **Redis is disposable.** Progress is checkpointed to Postgres (`TaskLog`); losing Redis means
  workers resume, not lose work. Never make Redis the sole home for state.
- **Two isolation axes.** _Data_: one PostgreSQL schema per project (`project_{uuid}`); only
  `User`, `ProjectMeta`, `DeploymentMeta` live in `public`. _Network_: the `sandbox` network is
  `internal: true` — sandboxes reach only `registry-proxy`.
- **Secrets** are AES-256-GCM encrypted under `ENCRYPTION_KEY`. Per-project schemas are created
  from generated SQL (derived from `schema_project_template.prisma`), **not** via `prisma migrate`.
- **Soft delete only.** Every domain model has `deletedAt DateTime?`. Queries must filter
  `deletedAt: null` **manually** (no Prisma extension). Delete = `update { deletedAt: now() }`,
  never `.delete()`. NextAuth/cascade models are exempt. Full rule in `CLAUDE.md`.
- Details (port allocation, URL-rewriting, container hardening, encrypted value shape) live in the
  `ai-studio-internals` skill — read it before touching compose, sandbox, per-project DB, or secrets.

## Code organization

Feature-sliced inside `apps/web`: `app/ → features/ → shared/ → packages/`, one-way, enforced by
ESLint (`import/no-internal-modules`, plus `no-restricted-imports` blocking deep `features/*/*`
imports from `app/`). `app/` is routing only — no logic there. Each feature slice exposes a single
`index.ts` public surface; never import another slice's internals.

**The UI split is load-bearing.** `packages/ui` (`@aiflow/ui`) owns primitives + design tokens
(`Button`, `Input`/`Field`, `Card`, `Spinner`, plus `styles/theme.css`). `apps/web/src/shared/ui`
owns app composition (`AppHeader`, `SideMenu`) that encodes this app's routes and must not move
into the shared package. Reach for an `@aiflow/ui` primitive before writing raw markup, and use the
semantic tokens (`text-fg-muted`, `border-border`, `bg-surface`) rather than raw `slate-*`.

## Gotchas

- **Tailwind v4, no `tailwind.config.js`.** Tokens are CSS-only (`@theme` in
  `packages/ui/src/styles/theme.css`). Auto source detection is **off** (`source(none)`) because on
  Windows it walks out of the repo and hits EPERM. Sources are explicit in
  `apps/web/src/app/globals.css` — **a new source directory needs its own `@source` line or its
  classes are silently missing** (unstyled, no error). `@aiflow/ui` already has one; new packages
  consuming Tailwind classes need to add it too.
- Use **`outline-hidden`**, not `outline-none` (in v4 `outline-none` means `outline-style: none`).
- `tsconfig.base.json` `paths` are **replaced, not merged** — `apps/web/tsconfig.json` repeats the
  `@aiflow/*` paths it needs.
- `packages/db` `typecheck` runs `yarn generate` first (two Prisma generators → two output dirs,
  `generated/public` and `generated/project`).
- **Prisma `binaryTargets` must include both `native` and `debian-openssl-3.0.x`.** The
  generated clients live on the Windows bind mount and are consumed by Linux compose services
  (`node:22-bookworm`). A Windows-only generate leaves the app unable to load the query engine;
  Credentials login then fails with Auth.js `CallbackRouteError`, shown as «Неверная почта или
  пароль».
- `getProjectClient(schemaName)` caches clients in a `Map`. You **must** call
  `evictProjectClient(schemaName)` when archiving/deleting a project, or connections leak for the
  process lifetime.
- `eslint.config.mjs` ignores all `*.config.{js,mjs,ts}` (they're in no tsconfig) — including itself.

## Git workflow

`task/{id}-{slug}` off `main`. `main` stays linear: rebase + fast-forward only, no merge commits,
no squash. Push with `--force-with-lease`, never bare `--force`. Conventional Commits with a
workspace scope (`feat(web): ...`, `chore(db): ...`). Refactor at each task boundary, timeboxed to
90 min, on a `chore/refactor-*` branch — behaviour-preserving (if a test has to change, it isn't a
refactor). Refactor immediately on a third duplicate, an import cycle, or a file past 300 lines.

## State files are part of the deliverable

Update them in the same commit as the change so the next session doesn't re-sweep the repo:

- Decision made/reversed → `docs/14-decisions-needed.md` (resolved table + rationale).
- Architectural invariant, command, or convention → `CLAUDE.md` (and this file).
- Directory layout, new package/feature slice → `docs/16-code-map.md`.
- Doc gone stale → the stale-documents table in `docs/15-engineering-conventions.md` § 7.
- An MCP/skill/subagent tried → `docs/13-agent-tooling.md` + the prompt test log.
- Open question settled → `docs/12-open-questions.md` status table (read the table, not the intro).

## Language policy

Think, plan, run tool calls, search, write commit messages, code comments, and agent-to-agent
messages in **English**. Reply to the user in **Russian** (their language). `docs/*.md` stays
English. Same split applies in the product: internal AI-role traffic is English; anything the end
user reads is in their language. Full rationale in `CLAUDE.md`.

## Where to go deeper

`docs/15` engineering conventions · `docs/14` decisions needed · `docs/12` open questions ·
`docs/13` agent tooling · `docs/16` code map · `docs/17` session-review lessons · the
`ai-studio-internals` skill for compose / sandbox / per-project DB / secrets.
