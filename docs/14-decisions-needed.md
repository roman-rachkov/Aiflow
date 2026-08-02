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
packages/ui/         design system: primitives, tokens
```

Internal structure within `apps/web` is feature-sliced — see [15-engineering-conventions.md](15-engineering-conventions.md) § 2.

This overrides the flat layout implied by `docs/10-infrastructure.md` (`src/`, `model-router/`, `prisma/` at root) and aligns with the "monorepo" wording in [04-roadmap.md](04-roadmap.md) § 5. Consequence: every `build.context` and `dockerfile` path in the compose file changes, and the app/worker Dockerfiles must copy the workspace manifests before installing so hoisting works.

### A5. Node version — OPEN

Images pin `node:20-alpine` (app, worker) and `node:20-bookworm-slim` (sandbox). Node 20 entered maintenance in late 2025. Stay on 20 for the MVP, or start on 22 LTS?

---

## B. Near-blocking — answer in the first week

### B1. Where SPEC.md is authored vs. stored

`docs/02-architecture.md` § 2.3 puts `SPEC.md` at the Gitea repo root. `docs/03-data-model.md` also has a `Specification` model holding versioned Markdown in the project schema. Both, or one?

Two sources of truth for the same artifact will drift. Options: DB is authoritative and Gitea gets a copy on commit; Gitea is authoritative and the DB caches; or drop one.

### B2. Language policy enforcement

The policy is set (internal traffic English, user-facing output in the user's language) and the prompts are translated. Unresolved: whether anything mechanically enforces it. See [13-agent-tooling.md](13-agent-tooling.md) T5.

Cheapest option is a check in the acceptance loop rejecting Cyrillic in Planner/Reviewer JSON. Worth doing at all, or rely on review discipline?

### B3. Auth providers for MVP-0

`docs/04-roadmap.md` Task 1.2 lists "NextAuth (Email magic link, GitHub OAuth)". Email magic links need an SMTP provider that is not in the compose file. Options: add Mailhog/Mailpit for dev, GitHub OAuth only for MVP-0, or credentials provider to start.

### B4. Test framework

`docs/04-roadmap.md` § 5 defers CI but Task 4.1 requires "unit test generation by an agent" and the sandbox runs tests. Nothing specifies the framework. Vitest or Jest? The Coder prompt will need to name it, and generated project code must match.

---

## C. Worth deciding early, cheap to defer

### C1. Prisma client generation strategy

`docs/03-data-model.md` § 4 creates a `PrismaClient` per project schema, cached in a WeakMap. A WeakMap keyed by schema-name strings will not retain entries as intended — string keys are not stable object identities. This is likely meant to be a `Map` with explicit eviction on project archive/delete. Confirm the intent before the data layer is written.

### C2. Two Prisma schema files, one generated client

`schema.prisma` (public) and `schema_project_template.prisma` (per project) both declare `generator client`. Two schemas generating into the same default location will collide. Needs separate output paths, or a single schema with `@@schema` and Prisma multi-schema support.

### C3. Structured output for Planner and Reviewer

Both prompts require strict JSON. `docs/06-prompt-planner.md` recommends "GPT-4o or similar with structured outputs / function calling". Does `model-router` guarantee structured-output support across all providers, or does the platform validate and retry on parse failure? Affects the router's API surface.

### C4. Aider version pin

`docs/11-sandbox.md` pins `aider-chat==0.60.0`. That release is from 2024. Keep the pin for reproducibility, or move to a current version before building the image?

### C5. `registry-proxy` implementation

Compose references `./registry-proxy` with `ALLOWED_HOSTS`, but nothing specifies what it is — Squid, Verdaccio, or a custom Node proxy. Open question #6 in [12-open-questions.md](12-open-questions.md) already notes the allowlist is too narrow. Choosing Verdaccio would partly answer both.

---

## D. Already decided — recorded to prevent re-litigation

| Decision | Value | Where |
|---|---|---|
| Git author | `Roman Rachkov <pakycb84@gmail.com>`, global config, no per-repo override | A1 |
| Repository visibility | Private; license deferred until opened | A2 |
| Package manager | Yarn + Lerna — overrides `npm ci` in the Dockerfiles | A3 |
| Repository layout | Monorepo, Yarn workspaces: `apps/`, `services/`, `packages/` | A4 |
| Git workflow | Branch per task, PR, rebase only — linear `main` | [15-engineering-conventions.md](15-engineering-conventions.md) § 1 |
| Module architecture | Feature-sliced in `apps/web`, shared logic in workspace packages | [15](15-engineering-conventions.md) § 2 |
| Size limits | File ≤ 200, function ≤ 50, complexity ≤ 10 — ESLint warn, blocking in CI | [15](15-engineering-conventions.md) § 3 |
| Linter / formatter | ESLint flat config (strict-type-checked) + Prettier, three gates | [15](15-engineering-conventions.md) § 4 |
| Refactoring cadence | Per roadmap task boundary, 90-minute timebox | [15](15-engineering-conventions.md) § 5 |
| Port allocation | App 3000, model-router 3001, Gitea 3002 (container-internal 3000) | [10-infrastructure.md](10-infrastructure.md) |
| Deployer prompt | Deferred until local MVP is judged satisfactory | [13-agent-tooling.md](13-agent-tooling.md) T3 |
| Documentation language | English, including role names | [`CLAUDE.md`](../CLAUDE.md) |
| Internal agent traffic | English; user-facing output in the user's language | [`CLAUDE.md`](../CLAUDE.md) |
| Superseded drafts | `ide.md`, `ide-analize.md` intentionally removed | [README.md](README.md) |

## Consequences for existing documents

A3 and A4 contradict what `docs/10-infrastructure.md` and `docs/11-sandbox.md` currently show. Those files were written before these decisions and are now partly stale. They are **not** yet updated — doing so is part of the scaffolding task, not a documentation edit to make in isolation:

- Compose `build.context` / `dockerfile` paths must point at `apps/web`, `apps/worker`, `services/model-router`, `services/registry-proxy`.
- Both Dockerfiles: `npm ci` → `yarn install --frozen-lockfile`, and workspace manifests must be copied before install for hoisting to work.
- Volume mounts `./src`, `./prisma` → `./apps/web/src`, `./packages/db/prisma`.
- The sandbox image generates *user project* code, which is a standalone Next.js app, not part of this monorepo. Its `npm` usage may legitimately stay — decide when writing the image.
