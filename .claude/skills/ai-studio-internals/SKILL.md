---
name: ai-studio-internals
description: Detailed AI Studio internals that most sessions do not need — port allocation and the Gitea 3000/3002 split, the two isolation axes (per-project Postgres schema, internal sandbox network), sandbox container hardening flags, secret encryption shape, and the conventions for code the platform generates for user projects. Read this when touching docker-compose, service URLs, sandbox configuration, per-project database access, secret handling, or the Coder's output conventions.
---

# AI Studio internals

Extracted from `CLAUDE.md` as a context-cost measure: this material is needed by a minority of sessions but was previously billed on every turn of every session. The one-line summaries stay in `CLAUDE.md`; the specifics live here.

Source documents remain authoritative. Where this file and a `docs/` file disagree, the doc wins and this file is stale — report it.

## Port allocation

Host ports: **3000** Next.js app, **3001** model-router, **3002** Gitea, 5432 Postgres, 6379 Redis, 9000/9001 MinIO. Full explanation at `docs/10-infrastructure.md:274`.

Gitea listens on 3000 _inside_ its container (its default) and publishes to 3002 on the host. So `GITEA_URL` is `http://gitea:3000` for inter-service calls, its healthcheck targets `localhost:3000` (runs inside the container), but `GITEA__server__ROOT_URL` is `http://localhost:3002/`. Both numbers are correct in their own context — don't "fix" one to match the other.

**App listen address:** `apps/web/server.ts` binds with `LISTEN_HOST` / `HOST` (default `0.0.0.0`). Never use Docker's `HOSTNAME` env (container id) — that listens only on eth0 and breaks the compose healthcheck against `127.0.0.1:3000`.

**Gitea bootstrap:** compose service `gitea-init` (`docker/gitea/bootstrap.sh`) creates the `GITEA_REPO_OWNER` admin user and writes an API token to volume `gitea_bootstrap` at `/run/gitea/token`. `app` / `worker` read `GITEA_ADMIN_TOKEN_FILE` (fallback: `GITEA_ADMIN_TOKEN`). Required after `docker compose down -v`.

## Isolation, in detail

Isolation runs on two axes. Both matter, and they fail differently.

**Data** — one PostgreSQL schema per project (`project_{uuid}`), reached by string-replacing the connection URL:

```
baseUrl.replace('schema=public', `schema=${schemaName}`)
```

(`docs/03-data-model.md:185`.) Clients are cached in a WeakMap. Only `User`, `ProjectMeta`, and `DeploymentMeta` live in `public`; everything else is per-project.

Project schemas are **not** migrated by `prisma migrate`. They are created from a generated SQL script derived from `schema_project_template.prisma` (`docs/03-data-model.md` § 8). `npx prisma migrate dev` touches the `public` schema only — running it expecting project schemas to follow is a mistake the layout invites.

**Network** — the `sandbox` network is declared `internal: true`, so sandbox containers cannot reach Postgres, Redis, or Gitea. Their only egress is `registry-proxy`, which filters by `ALLOWED_HOSTS`. This is why the `postgres` MCP server is worker-side only: there is no network path from a sandbox to the database.

## Sandbox hardening

Sandboxes are ephemeral and locked down (`docs/11-sandbox.md`):

- `ReadonlyRootfs: true`
- `CapDrop: ['ALL']`
- `no-new-privileges`
- 512 MB memory, 1 CPU
- tmpfs mounted `noexec,nosuid`

Destroyed after every task. Aider runs headless at a pinned version.

The lint gate is fatal (`docs/11-sandbox.md` sets `status = 'failure'` on ESLint
problems) and Prettier / `prisma validate` are part of the same gate. On success
the runner commits with the task title; on failure it exits 1 with no commit.
API key reaches the sandbox via `/run/secrets/api_key` (file bind), not `API_KEY`
env.

## Secrets

`ModelConfig.config` is AES-256-GCM encrypted under `process.env.ENCRYPTION_KEY` (32 bytes) and stored as `{"__encrypted__": "<base64>"}`.

`packages/crypto` exists specifically so `model-router` can decrypt keys before a provider call without depending on Prisma (`docs/14-decisions-needed.md:43-47`).

Open question #5 (`docs/12-open-questions.md:74-85`) is unresolved and relevant here: `process.env.API_KEY` is readable via `/proc/1/environ` by any process in the container, so passing provider keys to sandboxes by environment variable leaks them. Options on the table are a read-only secret file, stdin at container start, or Docker Secrets (Swarm only).

## Codegen lifecycle

`docs/02-architecture.md` § 4:

user approves `SPEC.md` → `plan:generate` → planner emits atomic tasks into `code:execute` → coder worker clones from Gitea into a volume, runs Aider, then tsc + ESLint → success commits to Gitea; failure goes to the reviewer, which either re-queues with clarification or marks FAILED → after all tasks, `deploy:run`.

Gitea holds one repo per project, with `SPEC.md` at the repo root so requirements are versioned alongside code.

## Conventions for generated application code

These govern code the **platform generates for user projects**, not code we write building the platform. Distinct rule sets — don't apply these to `apps/web`, and don't apply our conventions to Coder output.

The target stack is fixed — Next.js + Prisma + PostgreSQL only (`docs/01-system-spec.md:105`). Per `docs/07-prompt-coder.md`, generated code should follow:

- Next.js **App Router**: pages at `app/[resource]/page.tsx`, APIs as Route Handlers in `app/api/...`
- Components in `components/`, server actions in `lib/actions/`
- Strict TypeScript; type across the server/client boundary with `@prisma/client` types, avoid `any`
- Functional React components, Tailwind for styling
- Errors handled: try/catch in APIs, `error.tsx` for pages

## Where to look next

| Topic                                         | Document                    |
| --------------------------------------------- | --------------------------- |
| Compose services, networks, volumes, dev/prod | `docs/10-infrastructure.md` |
| Sandbox image, `runner.js`, dockerode         | `docs/11-sandbox.md`        |
| Schemas, dynamic Prisma, encryption           | `docs/03-data-model.md`     |
| Components, isolation rationale, codegen flow | `docs/02-architecture.md`   |
| Coder prompt as it ships                      | `docs/07-prompt-coder.md`   |
