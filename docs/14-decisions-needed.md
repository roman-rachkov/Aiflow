# Decisions Needed Before Implementation

Questions that must be answered before scaffolding starts, because each one changes code that would otherwise be written twice. Grouped by how much rework a late answer costs.

Distinct from [12-open-questions.md](12-open-questions.md) (architectural questions raised by the design review) and [13-agent-tooling.md](13-agent-tooling.md) § 5 (tooling questions). Those can be settled as the relevant component is built. These cannot.

---

## A. Blocking — answer before the first commit

**All resolved 2026-08-02.** Kept here for the rationale; see the summary table at the bottom.

### A1. Git identity — RESOLVED

`user.email` was `pakycb84@gail.com`. Confirmed a typo; corrected globally to `pakycb84@gmail.com`. `user.name` stays `Roman Rachkov`, inherited from the global config — no per-repo override. The first commit carries the corrected address, so no history rewrite is needed.

### A2. Repository visibility and license — RESOLVED

**Private.** The license question is deferred until the repo is opened, and is moot while it stays private. No `LICENSE` file for now.

### A3. Package manager — RESOLVED

**Yarn**, with **Lerna** for monorepo task orchestration. This overrides the `npm ci` calls in the `docs/10-infrastructure.md` Dockerfiles and the sandbox image in [11-sandbox.md](11-sandbox.md) — both need updating to `yarn install --frozen-lockfile` before those files become real.

One caveat worth noting before implementation: Lerna's original purpose — versioning and publishing independent packages to a registry — does not apply here, since nothing in this repo is published. Yarn workspaces alone cover dependency hoisting and cross-package linking. Lerna adds value mainly through `lerna run --scope` task filtering and changed-package detection. If that filtering is not used, Lerna is an extra dependency for nothing. Not a blocker, just something to revisit once the workspace layout exists.

### A4. Repository layout — RESOLVED

**Monorepo with Yarn workspaces**, in the shape below:

```
apps/web/            Next.js — frontend, REST API, WebSocket proxy
apps/worker/         BullMQ workers — four queues
services/model-router/
services/registry-proxy/
packages/db/         Prisma schema, generated client, shared domain types
packages/queue/      BullMQ queue definitions, job payload types
packages/ai-roles/   role prompts + model-router invocation
packages/crypto/     AES-256-GCM helpers for ModelConfig secrets
packages/ui/         design system: primitives, tokens
```

`packages/crypto` was added during scaffolding (2026-08-02), not in the original decision.
Encryption is needed by `web` (writing keys), `model-router` (decrypting before a provider
call) and `worker` — three consumers, which is past the § 2.3 threshold for promoting shared
logic to a package. Folding it into `packages/db` was rejected: it would make `model-router`
depend on Prisma for two pure functions.

Internal structure within `apps/web` is feature-sliced — see [15-engineering-conventions.md](15-engineering-conventions.md) § 2.

This overrides the flat layout implied by `docs/10-infrastructure.md` (`src/`, `model-router/`, `prisma/` at root) and aligns with the "monorepo" wording in [04-roadmap.md](04-roadmap.md) § 5. Consequence: every `build.context` and `dockerfile` path in the compose file changes, and the app/worker Dockerfiles must copy the workspace manifests before installing so hoisting works.

### A5. Node version — RESOLVED

**Node 22 LTS.** The dev machine already runs v22.22.2, Node 20 entered maintenance in late
2025, and starting a greenfield project on a maintenance release buys nothing. Images move to
`node:22-alpine` (app, worker) and `node:22-bookworm-slim` (sandbox).

---

## B. Near-blocking — answer in the first week

### B1. Where SPEC.md is authored vs. stored — RESOLVED

**A directory, not the repo root, and the database is authoritative.**

Layout: `specs/{project-slug}/SPEC.md` in this repository; `specs/SPEC.md` in a generated
project's repository. Putting artifacts at the repo root does not scale — the first project
with two specification-adjacent documents turns the root into a dumping ground.

Source of truth: the `Specification` table (append-only, versioned, `approvedAt`). Gitea
receives a copy on each version commit, so requirements stay versioned alongside the code
without being the thing the platform reads. Drift is one-directional and therefore
recoverable: the DB can always re-emit the file.

### B2. Language policy enforcement

The policy is set (internal traffic English, user-facing output in the user's language) and the prompts are translated. Unresolved: whether anything mechanically enforces it. See [13-agent-tooling.md](13-agent-tooling.md) T5.

Cheapest option is a check in the acceptance loop rejecting Cyrillic in Planner/Reviewer JSON. Worth doing at all, or rely on review discipline?

### B3. Auth providers for MVP-0 — RESOLVED

**Credentials** (NextAuth Credentials provider). Recorded at Task 1.2a and in
the summary table. Email magic link and GitHub OAuth both need external
services (SMTP / OAuth app) that make local Compose development impossible;
deferred until those are available in the stack.

Rejected for MVP-0: Mailhog/Mailpit + Email provider; GitHub OAuth only.

### B4. Test framework — RESOLVED

**Vitest.** It reuses the Vite/esbuild transform the Next.js app already depends on, so a TypeScript ESM monorepo needs no `ts-jest` or Babel layer to run a test — Jest would add a second transform pipeline to configure and keep in sync. The Jest-compatible `expect`/`describe`/`it` surface means the Coder prompt and generated project code carry no unusual API.

Wired at the repository root (`vitest.config.ts`), not per workspace: one config, one `include` glob covering `apps/*`, `services/*`, `packages/*` and `tools/*`. `passWithNoTests: false` is the load-bearing setting — a workspace with zero tests fails the gate loudly instead of exiting 0 and looking green, which is exactly the defect this replaced (`docs/17-session-review.md` § 3.2).

Coverage via `@vitest/coverage-v8`. Both packages are MIT.

---

## C. Worth deciding early, cheap to defer

### C1. Prisma client generation strategy — RESOLVED

**A `Map` with explicit eviction.** The `WeakMap` in `docs/03-data-model.md` § 4 was not merely
ineffective, it was invalid: `WeakMap` requires object keys, so `.set(schemaName, client)` with a
string throws `TypeError: Invalid value used as weak map key`. The code as written could never
have run.

Replacement: a module-level `Map<string, PrismaClient>`, with `$disconnect()` and delete on
project archive or delete. A pool cap is deliberately omitted for MVP — 5 concurrent projects
cannot exhaust connections — but the eviction path must exist from the start, because adding it
later means auditing every call site.

### C2. Two Prisma schema files, one generated client — RESOLVED

**Separate `output` paths.** `packages/db/prisma/schema.prisma` generates into
`../generated/public`, `schema_project_template.prisma` into `../generated/project`. Both are
gitignored as build artifacts. Both generators also set
`binaryTargets = ["native", "debian-openssl-3.0.x"]` so a generate on Windows still ships the
Linux engine that compose (`node:22-bookworm`) needs on the same bind-mounted tree.

Prisma's multi-schema preview feature was the alternative and is rejected: it models a fixed
set of named schemas, while this platform creates schemas at runtime, one per project. The
template is not a migration target at all — it is the source for a generated SQL script.

### C3. Structured output for Planner and Reviewer — RESOLVED 2026-08-07

**Platform validates JSON and retries on parse failure (max 2 retries).** Do not
require native structured-output / function-calling from every provider —
`model-router` remains OpenAI-compatible chat; callers own schema validation.

Pairs with open question #9 (escalation): an advisor call is a second routed
request under the same validate-and-retry contract; disagreement between
primary and advisor is a separate policy, not a structured-output concern.

### C4. Aider version pin — RESOLVED 2026-08-07

**Keep `aider-chat==0.60.0`** for the first sandbox image so builds are
reproducible. A later bump is a one-line `ARG` change in the Dockerfile; do not
block Task 3.1 on chasing a current release.

### C5. `registry-proxy` implementation — RESOLVED 2026-08-07

**Custom Node HTTP CONNECT/forward proxy** (`services/registry-proxy`) with an
expandable `ALLOWED_HOSTS` allowlist (comma-separated). Same answer as open
question #6 in [12-open-questions.md](12-open-questions.md). Verdaccio deferred —
extra stateful service for little MVP gain.

---

## D0. Design system before consumers — RESOLVED 2026-08-04

Decided during Task 1.2d, and recorded here because it overrides a written rule. Referred to as **#10** in the summary table.

**Conventions § 2.3 says a slice used by one app stays a slice.** `apps/web` is still the only consumer of `packages/ui` — `apps/worker` is headless BullMQ and will never import a button. By that rule the primitives belonged in `apps/web/src/shared/ui`, and the code map said so explicitly.

**Overridden by decision.** The argument for the rule is that premature packaging costs build wiring; the argument against it here is that a design system is not an incidental extraction. Screens built without shared tokens have to be retrofitted with them, that cost scales with the number of screens, and 09-ui-spec plans eight of them. The wiring is paid once. The user's framing when deciding: `packages/ui` being deferred was a shortcoming, not a design.

**The boundary that keeps the exception narrow.** `packages/ui` holds primitives and tokens that know nothing about any app. Composition that encodes this app's routes — `AppHeader`, `SideMenu` — stays in `apps/web/src/shared/ui`. Without that split the exception would justify moving anything.

**What was rejected alongside it:**

- **shadcn CLI.** Its templates assume React 19 and generate into an app, not a workspace package; every generated file would need editing. The patterns (cva variants, `cn`, Radix underneath) were adopted directly instead. All licences were verified allowlisted, so adding Radix later is unaffected.
- **A full primitive set.** Four were built — Button, Input/Field, Card, Spinner — because those have consumers today. Modal, toast, tabs, timeline and file tree belong to screens that do not exist, and designing their APIs against an imagined caller is the same mistake in a different place.
- **Dark theme.** 09-ui-spec § 9 mandates light only. A second colour scheme is a design decision, not a default.

### D0a. OpenUI as the product component foundation — RESOLVED 2026-08-07

**Adopt [`@openuidev/react-ui`](https://github.com/thesysdev/openui) (MIT) as the ready-made component base for AI Studio itself** — Button, Card, forms, tables, charts, layout blocks, plus `ThemeProvider`. Scope is **our app only** (`apps/web`); generated user projects do not receive OpenUI. Chat stays on `@assistant-ui/react` for now; Generative UI (`openuiChatLibrary` / OpenUI Lang) is a later, separate step.

Licence verified via `npm view` + upstream `LICENSE` (MIT) — allowlisted under conventions § 8 for `product`.

**Relation to D0 / `packages/ui`.** Hand-written primitives were a bootstrap while screens were few. OpenUI supplies the breadth 09-ui-spec still needs (tables, tabs, charts, richer forms). `@aiflow/ui` becomes an OpenUI-backed facade: same public API (`Button`, `Input`/`Field`, `Card`, `Spinner`) so feature screens keep a stable import, while OpenUI owns the visuals. Tailwind `@theme` tokens stay in `packages/ui/styles/theme.css` for app-shell utility classes. App composition (`AppHeader`, `SideMenu`, `OpenUiThemeProvider`) remains in `apps/web/src/shared/ui`.

**Theming.** OpenUI layered CSS + unlayered `:root` brand overrides in `globals.css` (light only, `#2563EB` primary). `ThemeProvider` is not used — OpenUI's JS barrel is `"use client"` + `export *`, which Next.js rejects; wrappers import per-component entries (`@openuidev/react-ui/Button`, etc.).

**What this is not:** replacing the Researcher chat shell, shipping OpenUI into Coder output, or adopting Open WebUI (different project, branding restrictions).

---

---

## E. MVP-3 Agent Maturity — approach decisions (planned 2026-08-09)

Decided when scoping MVP-3 (the agent-maturity phase from the Habr 1068168
article; see [04-roadmap.md](04-roadmap.md) § 5). These fix _how_ each track is
built before implementation, because the choice changes code that would otherwise
be written twice. Recorded here, not in `12-open-questions.md`, because they are
decisions, not open questions.

### E1. Durable execution stays on BullMQ + DB idempotency — RESOLVED

**BullMQ remains the queue orchestrator.** Durable execution is idempotent
operations + at-least-once guards in the database, not a new engine. The source of
truth is the `Task`/`Deployment` status machine in Postgres, not process state.

Rejected: Temporal (a second runtime + SDK + service for a scale the platform does
not reach — 5 concurrent projects); Restate (lighter, but still a new durable-JS
runtime for the same gain). Open question #9 (escalation) stays post-MVP and is
unaffected. See MVP-3 tasks A1, A2.

### E2. Langfuse self-host is the observability layer — RESOLVED

**Langfuse self-host in `docker-compose.yml`** is the single observability layer
for all LLM roles. A wrapper over `createOpenAICompatibleProvider` in
`packages/ai-roles` traces prompt/tokens/latency/cost for Analyst/Planner/Coder/
Reviewer. An `LLMCall` row in the public schema stays as a cold fallback/audit,
not the primary path.

Rejected: Arize Phoenix (lighter, but Langfuse's evals/datasets fit B3 better);
self-written logging to Postgres only (no ready UI/eval surface — re-inventing
Langfuse). See MVP-3 tasks B1, B2.

### E3. Reviewer is a Self-Refine loop, not a one-shot verdict — RESOLVED

**REJECTED → the Coder retries with a refined prompt + memory of the task's past
failures → Reviewer again.** A retry cap (≈3) then FAILED + manual intervention.
The contract is already specified in
[.claude/agents/reviewer.md](../.claude/agents/reviewer.md) implementation notes;
MVP-3 implements the runtime.

Rejected: a single verdict (the MVP-2 shape — no self-correction, every REJECT is
manual); unbounded retries (cost). This enriches MVP-2 task 4.1. See MVP-3 task C1.

### E4. Policy layer is a deterministic guard, not prompt parsing — RESOLVED

**Tool-calling capability ≠ permission.** A capability set per role
(`read-spec`, `read-diff`, `write-commit`, `verdict`) is enforced inside the
provider wrapper _before_ the LLM call. A violation is an audit event + throw,
never "the LLM decided".

Rejected: parsing the model's tool choices to infer intent (brittle, injectable);
relying on prompt wording alone. See MVP-3 task A4.

---

## D. Already decided — recorded to prevent re-litigation

| Decision                | Value                                                                                                                                                                                                  | Where                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Git author              | `Roman Rachkov <pakycb84@gmail.com>`, global config, no per-repo override                                                                                                                              | A1                                                                 |
| Repository visibility   | Private; license deferred until opened                                                                                                                                                                 | A2                                                                 |
| Package manager         | Yarn + Lerna — overrides `npm ci` in the Dockerfiles                                                                                                                                                   | A3                                                                 |
| Repository layout       | Monorepo, Yarn workspaces: `apps/`, `services/`, `packages/`                                                                                                                                           | A4                                                                 |
| Git workflow            | Branch per task, PR, rebase only — linear `main`                                                                                                                                                       | [15-engineering-conventions.md](15-engineering-conventions.md) § 1 |
| Node version            | Node 22 LTS (already on dev machine) — overrides `node:20` in images                                                                                                                                   | A5                                                                 |
| SPEC storage            | `specs/{slug}/SPEC.md` directory; DB authoritative, Gitea gets a copy                                                                                                                                  | B1                                                                 |
| SPEC in user repo       | `specs/SPEC.md` at the repo root, not the project root                                                                                                                                                 | B1                                                                 |
| Prisma client cache     | `Map<string, PrismaClient>` with explicit eviction — `WeakMap` was invalid                                                                                                                             | C1                                                                 |
| Prisma generator output | `../generated/public` and `../generated/project` — separate, not colliding                                                                                                                             | C2                                                                 |
| `packages/crypto`       | Sixth workspace package — web, worker and model-router all need AES-256-GCM                                                                                                                            | A4 (extended)                                                      |
| Project create flow     | Compensation saga: `createProjectSchema` → `projectMeta.create`, `dropProjectSchema` on insert failure (two connections cannot share a transaction)                                                    | Task 1.2b                                                          |
| Delete confirm UI       | In-feature overlay in `features/projects`, not a `@aiflow/ui` primitive — one consumer (D0 / § 2.3); promote on the second                                                                             | Task 1.2b                                                          |
| Projects transport      | Client forms `fetch` the REST API, not server actions — a feature→feature import for `requireUser` is blocked by FSD boundaries (`boundaries/dependencies`)                                            | Task 1.2b                                                          |
| UI mode vs role         | `User.uiMode` (BASIC                                                                                                                                                                                   | PRO) controls navigation; `User.role` is for future admin          | this task |
| Module architecture     | Feature-sliced in `apps/web`, shared logic in workspace packages                                                                                                                                       | [15](15-engineering-conventions.md) § 2                            |
| Size limits             | File ≤ 200, function ≤ 50, complexity ≤ 10 — ESLint warn, blocking in CI                                                                                                                               | [15](15-engineering-conventions.md) § 3                            |
| Linter / formatter      | ESLint flat config (strict-type-checked) + Prettier, three gates                                                                                                                                       | [15](15-engineering-conventions.md) § 4                            |
| Refactoring cadence     | Per roadmap task boundary, 90-minute timebox                                                                                                                                                           | [15](15-engineering-conventions.md) § 5                            |
| Port allocation         | App 3000, model-router 3001, Gitea 3002 (container-internal 3000)                                                                                                                                      | [10-infrastructure.md](10-infrastructure.md)                       |
| Deployer prompt         | Deferred until local MVP is judged satisfactory                                                                                                                                                        | [13-agent-tooling.md](13-agent-tooling.md) T3                      |
| Documentation language  | English, including role names                                                                                                                                                                          | [`CLAUDE.md`](../CLAUDE.md)                                        |
| Internal agent traffic  | English; user-facing output in the user's language                                                                                                                                                     | [`CLAUDE.md`](../CLAUDE.md)                                        |
| Superseded drafts       | `ide.md`, `ide-analize.md` intentionally removed                                                                                                                                                       | [README.md](README.md)                                             |
| Auth provider (MVP)     | Credentials, not Email magic link / GitHub OAuth — both need external services                                                                                                                         | Task 1.2a                                                          |
| Auth session strategy   | JWT, not database sessions — Credentials gets no `Session` row from the adapter                                                                                                                        | Task 1.2a                                                          |
| PRO-mode guard name     | `requireProMode`, not `requireEngineer` — it checks `uiMode`, not a permission                                                                                                                         | Task 1.2a                                                          |
| `@auth/core` version    | Pinned via root `resolutions` — two copies made the adapter type unassignable                                                                                                                          | Task 1.2a                                                          |
| User avatar column      | `image`, renamed from `avatarUrl` — the adapter contract names it                                                                                                                                      | Task 1.2a                                                          |
| Tailwind version        | v4 — CSS-first `@theme`, no `tailwind.config.js`, `@tailwindcss/postcss`                                                                                                                               | Task 1.2c                                                          |
| Tailwind source scan    | `source(none)` + explicit `@source` — auto-detection escapes the repo on Windows                                                                                                                       | Task 1.2c                                                          |
| `packages/ui` promotion | Created with one consumer, overriding conventions § 2.3 — see #10 below                                                                                                                                | Task 1.2d                                                          |
| Component library       | **OpenUI** (`@openuidev/react-ui`, MIT) for AI Studio screens; hand-written `@aiflow/ui` primitives retained only as token/`Spinner` bridge during migration — see D0a                                 | D0a 2026-08-07                                                     |
| Dark theme              | Not built — 09-ui-spec § 9 mandates light only                                                                                                                                                         | Task 1.2d                                                          |
| Model provider          | Universal OpenAI-compatible (`createOpenAICompatibleProvider`): configurable `baseURL`/`apiKey`/`model` for BOTH chat and embeddings; z.ai is one instance. Mock paths preserved for keyless local dev | Task 2.1                                                           |
| RAG engine              | LlamaIndex.Ts (MIT) `SentenceSplitter` for chunking; pgvector for storage + retrieval (`$queryRawUnsafe` cosine top-k). `@llamaindex/text-splitter` not on npm — umbrella `llamaindex` used            | Task 2.1                                                           |
| PDF text extraction     | `pdf-parse@2.4.5` (Apache-2.0 — was MIT at 1.x; still allowlisted); async class API                                                                                                                    | Task 2.1                                                           |
| SPEC UI scope           | Version list + single-version view only; diff/compare deferred to a later mini-task                                                                                                                    | Task 2.1                                                           |
| Indexing execution      | Synchronous in the route handler for MVP-0 (dozens of chunks, one embeddings batch); worker queue deferred to MVP-1                                                                                    | Task 2.1                                                           |
| Cross-slice composition | `generateSpecification` takes a `GenerationDeps` bag (DI) — `boundaries/dependencies` `capture:slice` forbids feature→feature imports, so the route wires chat/files functions in                      | Task 2.1                                                           |
| Dev Compose topology    | Stock `node:22-bookworm` + bind mount + named `node_modules` volumes; no `build:` / no app Dockerfiles in dev. Entrypoint `docker/dev-entrypoint.sh`. App Dockerfiles deferred to prod                 | this task                                                          |
| Structured JSON output  | Platform validates + retries on parse failure (max 2); no native structured-output required from every provider                                                                                        | C3 2026-08-07                                                      |
| Aider version pin       | Keep `0.60.0` for first image reproducibility; bump is one-line ARG later                                                                                                                              | C4 2026-08-07                                                      |
| `registry-proxy`        | Custom Node CONNECT/forward proxy + expandable `ALLOWED_HOSTS`; Verdaccio deferred                                                                                                                     | C5 2026-08-07 (= OQ #6)                                            |
| User project template   | `templates/user-nextjs/` in this monorepo → copied into Gitea on bootstrap; sandbox image stays template-free                                                                                          | [12](12-open-questions.md) #1 2026-08-07                           |
| Prisma in sandbox       | Validate only in sandbox; apply schema at deploy via `db push` (MVP)                                                                                                                                   | [12](12-open-questions.md) #2 2026-08-07                           |
| Sandbox API key         | Read-only file mount at `/run/secrets/api_key`; never `API_KEY` env                                                                                                                                    | [12](12-open-questions.md) #5 2026-08-07                           |
| Product LLM Reviewer    | Deferred to MVP-2; product gate = sandbox checks. Dev `/orchestrate` may still use Reviewer                                                                                                            | [12](12-open-questions.md) #7 2026-08-07                           |
| Slim MVP-1 scope        | Planner + sandbox Coder for simple CRUD; 4.1–4.3 and 5.1–5.3 → MVP-2                                                                                                                                   | [12](12-open-questions.md) #8 / [04](04-roadmap.md) § 3 2026-08-07 |
| MVP-3 durable execution | BullMQ + DB idempotency (status machine as source of truth); Temporal/Restate rejected as overkill                                                                                                     | E1 2026-08-09                                                      |
| LLM observability       | Langfuse self-host in compose; `ai-roles` provider wrapper traces all roles; `LLMCall` row = cold fallback                                                                                             | E2 2026-08-09                                                      |
| Reviewer shape          | Self-Refine loop (REJECTED → Coder retry with memory → Reviewer, cap ≈3); one-shot verdict rejected                                                                                                    | E3 2026-08-09                                                      |
| Role policy             | Capability set enforced in the provider wrapper before the LLM call; capability ≠ permission; prompt parsing rejected                                                                                  | E4 2026-08-09                                                      |

## Consequences for existing documents

A3 and A4 contradict what `docs/10-infrastructure.md` and `docs/11-sandbox.md` currently show. Those files were written before these decisions and are now partly stale:

- **Dev path (resolved):** `docker-compose.yml` uses published images only — no `build:` keys. Node services are `node:22-bookworm` with bind mounts; see the Dev Compose topology row above.
- **Prod / future:** multi-stage Dockerfiles beside each app/service, `yarn install --frozen-lockfile`, root build context — still to be written when packaging for prod.
- The sandbox image generates _user project_ code, which is a standalone Next.js app, not part of this monorepo. Its `npm` usage may legitimately stay — decide when writing the image.
