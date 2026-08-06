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

### B3. Auth providers for MVP-0

`docs/04-roadmap.md` Task 1.2 lists "NextAuth (Email magic link, GitHub OAuth)". Email magic links need an SMTP provider that is not in the compose file. Options: add Mailhog/Mailpit for dev, GitHub OAuth only for MVP-0, or credentials provider to start.

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

### C3. Structured output for Planner and Reviewer

Both prompts require strict JSON. `docs/06-prompt-planner.md` recommends "GPT-4o or similar with structured outputs / function calling". Does `model-router` guarantee structured-output support across all providers, or does the platform validate and retry on parse failure? Affects the router's API surface.

Decide this alongside question #9 in [12-open-questions.md](12-open-questions.md) (escalation to a stronger model). Escalation is a second routed request, so whatever guarantee C3 settles on has to hold for the advisor call too — and if the answer is validate-and-retry, the retry budget interacts with the disagreement case.

### C4. Aider version pin

`docs/11-sandbox.md` pins `aider-chat==0.60.0`. That release is from 2024. Keep the pin for reproducibility, or move to a current version before building the image?

### C5. `registry-proxy` implementation

Compose references `./registry-proxy` with `ALLOWED_HOSTS`, but nothing specifies what it is — Squid, Verdaccio, or a custom Node proxy. Open question #6 in [12-open-questions.md](12-open-questions.md) already notes the allowlist is too narrow. Choosing Verdaccio would partly answer both.

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

## Consequences for existing documents

A3 and A4 contradict what `docs/10-infrastructure.md` and `docs/11-sandbox.md` currently show. Those files were written before these decisions and are now partly stale:

- **Dev path (resolved):** `docker-compose.yml` uses published images only — no `build:` keys. Node services are `node:22-bookworm` with bind mounts; see the Dev Compose topology row above.
- **Prod / future:** multi-stage Dockerfiles beside each app/service, `yarn install --frozen-lockfile`, root build context — still to be written when packaging for prod.
- The sandbox image generates _user project_ code, which is a standalone Next.js app, not part of this monorepo. Its `npm` usage may legitimately stay — decide when writing the image.
