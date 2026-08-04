# AI Studio — Code Map

One line per package / slice: what it owns, its public entry point, its
dependencies. The file that lets a session act without re-deriving the
structure by search. Layout per A4 in
[14-decisions-needed.md](14-decisions-needed.md).

```
apps/
├── web/                  Next.js (App Router, TS strict, Tailwind)
│                         └── public entry: src/app, src/features/*
│                             deps: @aiflow/{db,queue,crypto,ai-roles,ui}
│                             layout: app/ (routing only) → features/ →
│                                     shared/ → packages/ (§ 2.2)
└── worker/               BullMQ workers, one dir per queue (spec, plan, code, deploy)
    └── public entry: src/index.ts
        deps: @aiflow/{db,queue,crypto,ai-roles}

services/
├── model-router/         Express, port 3001. OpenAI-compatible facade over
│                         routerai/OpenAI/Anthropic, fallback chain, Redis cache.
│                         Stores no keys. deps: @aiflow/crypto
└── registry-proxy/       Sandbox egress filter (allowlist). Task 3.1. deps: none

packages/
├── db/                   Prisma schemas + generated clients
│                         ├── prisma/schema.prisma        → public schema
│                         ├── prisma/schema_project_template.prisma → project schemas
│                         ├── generated/public, generated/project (build artifacts)
│                         ├── src/index.ts  — the Prisma client factory:
│                         │     getPublicClient(), getProjectClient(schemaName)
│                         │     Map-cached + name-validated, evictProjectClient()
│                         │     on archive/delete, disconnectAll() on shutdown (C1)
│                         └── scripts/generate-project-sql.ts — renders the
│                             template to CREATE SCHEMA + DDL + the pgvector
│                             column and HNSW index. `yarn workspace @aiflow/db
│                             project-sql project_x` (C2)
│                             scripts/seed-dev-user.ts — a Credentials login for
│                             local dev; refuses a non-local DATABASE_URL.
│                             `yarn workspace @aiflow/db seed:dev-user`
├── queue/                BullMQ definitions: the four queues + typed payloads,
│                         concurrency 1, default job options
├── crypto/               AES-256-GCM helpers: encryptSecret/decryptSecret,
│                         {"__encrypted__": ...} envelope (Task 1.3)
├── ai-roles/             Role prompts + model-router invocation (Task 1.3)
└── ui/                   Design system: primitives, tokens (Task 1.2)

tools/                    Dev-only workspaces. Ship nowhere; still gated by
│                         `yarn verify` — an unverified self-analysis tool
│                         would be worth less than none.
└── session-analyzer/     Tool-flow analytics over ~/.claude transcripts.
                          └── public entry: src/cli.ts (via tsx), consumed by
                              /session-review. deps: none (Node built-ins only)
                              src/transcript.ts is the only parse boundary;
                              src/taxonomy.ts owns the ourProblem split.
                              Complements Anthropic's session-report (cost),
                              deliberately not a fork of it — conventions § 8.3
```

## Cross-cutting

| Concern                                                            | Where                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Auth helpers (`requireUser`, `requireProMode`, `canAccessProject`) | `apps/web/src/features/auth` (Task 1.2a)             |
| App shell (header, side menu)                                      | `apps/web/src/shared/ui` (Task 1.2a)                 |
| Prisma client factory                                              | `packages/db/src/index.ts`                           |
| Queue definitions                                                  | `packages/queue/src`                                 |
| Encryption helpers                                                 | `packages/crypto/src`                                |
| Gitea client                                                       | `apps/web/src/shared/gitea` (planned)                |
| MinIO client                                                       | `apps/web/src/shared/minio` (planned)                |
| Env validation                                                     | `.env.example` + `apps/web/src/shared/env` (planned) |

## Rules that keep it readable

- One `index.ts` per package is the only public surface; `import/no-internal-modules`
  enforces it. `apps/web` features export through their slice `index.ts` (§ 2.2).
  `tools/*` are exempt: they are executables, not libraries, and expose a `bin`
  entry rather than an importable surface.
- Generated clients (`packages/db/generated/*`) and `next-env.d.ts` are build
  artifacts, gitignored, and exempt from the size rules.
- `packages/crypto`, `packages/ai-roles` and `packages/ui` are declared but empty
  until their consumers arrive (Task 1.3 / 1.2); `packages/db` is real — schemas,
  client factory and the project-schema generator. `packages/ui` stays empty
  through 1.2a on purpose: the shell components have one consumer, which fails
  the promotion test in conventions § 2.3, so they live in `apps/web/src/shared/ui`
  until a second consumer earns the move.
