# Decisions Needed Before Implementation

Questions that must be answered before scaffolding starts, because each one changes code that would otherwise be written twice. Grouped by how much rework a late answer costs.

Distinct from [12-open-questions.md](12-open-questions.md) (architectural questions raised by the design review) and [13-agent-tooling.md](13-agent-tooling.md) § 5 (tooling questions). Those can be settled as the relevant component is built. These cannot.

---

## A. Blocking — answer before the first commit

### A1. Git identity

The global Git config currently reads:

```
user.name  = Roman Rachkov
user.email = pakycb84@gail.com
```

`gail.com` looks like a typo for `gmail.com`. Commits carry the author email permanently; fixing it later means rewriting history or living with a broken attribution.

Also: should this repo use a local `user.email` override (e.g. a GitHub noreply address) instead of the global one?

### A2. Repository visibility and license

`git@github.com:roman-rachkov/Aiflow.git` is empty. Public or private? If public, a `LICENSE` file is needed before the first push — absent one, default copyright applies and nobody can legally reuse the code, which conflicts with an open-development posture. If private, this is moot for now.

### A3. Package manager

`docs/10-infrastructure.md` Dockerfiles use `npm ci`. Confirm npm, or switch to pnpm before `package.json` exists. Switching later means regenerating lock files, editing both Dockerfiles, and updating the sandbox image.

### A4. Repository layout: monorepo or flat

`docs/04-roadmap.md` § 5 says "monorepo in Gitea (Next.js, workers, Docker Compose config)". `docs/10-infrastructure.md` shows a flat layout: `src/`, `model-router/`, `registry-proxy/`, `prisma/` at root, no workspace tooling.

Flat with a shared `package.json` is simpler and matches the compose file. A real monorepo (pnpm workspaces / Turborepo) isolates the worker and model-router dependency trees. Decide now — this is the directory structure everything else assumes.

### A5. Node version

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
| Port allocation | App 3000, model-router 3001, Gitea 3002 (container-internal 3000) | [10-infrastructure.md](10-infrastructure.md) |
| Deployer prompt | Deferred until local MVP is judged satisfactory | [13-agent-tooling.md](13-agent-tooling.md) T3 |
| Documentation language | English, including role names | [`CLAUDE.md`](../CLAUDE.md) |
| Internal agent traffic | English; user-facing output in the user's language | [`CLAUDE.md`](../CLAUDE.md) |
| Superseded drafts | `ide.md`, `ide-analize.md` intentionally removed | [README.md](README.md) |
