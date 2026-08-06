# AI Studio — Code Map

One line per package / slice: what it owns, its public entry point, its
dependencies. The file that lets a session act without re-deriving the
structure by search. Layout per A4 in
[14-decisions-needed.md](14-decisions-needed.md).

```
apps/
├── web/                  Next.js (App Router, TS strict, Tailwind v4)
│                         └── public entry: src/app, src/features/*
│                             deps: @aiflow/{db,queue,ai-roles,ui} (@aiflow/crypto
│                             wired in next.config/tsconfig but empty — no
│                             runtime consumer yet)
│                             layout: app/ (routing only) → features/ →
│                                     shared/ → packages/ (§ 2.2)
│                             scripts/ingest-docs.ts — `yarn workspace
│                               @aiflow/web docs:ingest`: fresh project schema
│                               + index docs/*.md (+ CLAUDE.md) for local RAG
│                               (nomic-embed / LM Studio); no MinIO
│   features:
│     ├── auth/           NextAuth v5, guards, session (Task 1.2a)
│     ├── projects/       Projects CRUD + schema provisioning (Task 1.2b)
│     │                     └── public entry: src/index.ts
│     │                         model/service.ts — create/list/get/remove over
│     │                           ProjectMeta; create is a compensation saga
│     │                           (createProjectSchema → projectMeta.create →
│     │                           dropProjectSchema on failure)
│     │                         model/access.ts — resolveProjectSchema(id, ownerId)
│     │                           (Task 2.1): the per-route auth+schema gate shared
│     │                           by chat/files/specifications routes; self-contained
│     │                           (canAccessProject dropped — FSD feature→feature
│     │                           import forbidden; findUnique enforces ownership +
│     │                           soft-delete, null→404, no existence leak)
│     │                         ui/ — ProjectList, ProjectCard, ProjectDetails,
│     │                           CreateProjectForm + DeleteProjectButton (the
│     │                           delete confirm overlay lives here, not in
│     │                           @aiflow/ui — one consumer, per D0 / § 2.3)
│     ├── chat/           Analyst chat — SSE streaming + history (Task 1.3)
│     │                     └── public entry: src/index.ts
│     │                         model/service.ts — listMessages/saveMessage over
│     │                           ChatMessage (project-scoped); model/schema.ts —
│     │                           readSystemPrompt() reads .claude/agents/analyst.md
│     │                           per turn (module-relative path, not cwd);
│     │                           withRagContext(base, context) appends RAG context
│     │                           to the system prompt (Task 2.1); readSpecTemplate()
│     │                           extracts the SPEC.md template block for generation
│     │                         ui/ChatPanel.tsx — @assistant-ui/react runtime +
│     │                           primitives; ui/researcher-runtime.ts —
│     │                           ChatModelAdapter (POST → SSE → cumulative yield);
│     │                           ui/parse-sse-response.ts — client SSE framing
│     ├── files/          Upload, RAG indexing + retrieval (Task 2.1)
│     │                     └── public entry: src/index.ts
│     │                         model/service.ts — createUserFile/listFiles over
│     │                           UserFile + linked Document (atomic nested create);
│     │                         model/index-service.ts — indexDocument: MinIO bytes
│     │                           → extractText → chunkText → embed → atomic chunk
│     │                           replace in a $transaction (embedding written via
│     │                           $executeRaw '[...]'::vector; never leaves INDEXING);
│     │                         model/retrieve.ts — retrieveContext/retrieveChunks:
│     │                           pgvector cosine top-k ($queryRawUnsafe, k=$1),
│     │                           never throws (degrades to '' on embed failure);
│     │                         model/extract.ts (pdf-parse text layer) + chunk.ts
│     │                           (LlamaIndex SentenceSplitter 512/50, toVectorLiteral)
│     │                         ui/FilePanel.tsx — upload (hidden input) + per-row
│     │                           index trigger + status badge
│     └── specifications/ SPEC.md version list, view, generation (Task 2.1)
│                           └── public entry: src/index.ts
│                               model/service.ts — listSpecifications /
│                                 getSpecificationByVersion (findFirst: version
│                                 @@unique but deletedAt not in it) /
│                                 createSpecificationVersion (max+1, createdBy AI);
│                               model/generate.ts — generateSpecification(schemaName,
│                                 deps): non-streaming generation via DI (cross-slice
│                                 listMessages/retrieveContext/readSpecTemplate
│                                 injected — boundaries/dependencies capture:slice
│                                 forbids feature→feature imports)
│                               ui/SpecificationPanel.tsx — version list, lazy content
│                                 view, generate button
│   shared:
│     ├── ui/             AppHeader, SideMenu (app composition, Task 1.2a)
│     └── minio/          MinIO client: putObject/getObject/ensureBucket, lazy
│                          singleton, scheme-less S3_ENDPOINT tolerated (Task 2.1)
│   routes (app/):
│     /  → redirect('/projects');  /projects, /projects/new, /projects/[id]
│     /projects/[id]/research — two-panel Researcher page (Task 1.3; live artifacts
│       panel since Task 2.1: FilePanel + SpecificationPanel + Roadmap card)
│     /api/projects (GET list, POST create), /api/projects/[id] (GET, DELETE)
│     /api/projects/[id]/chat (POST — SSE-streamed Analyst reply, Task 1.3;
│       RAG context mixed into the system prompt since Task 2.1)
│     /api/projects/[id]/files (GET list, POST upload — Task 2.1)
│     /api/projects/[id]/files/[fid]/index (POST — synchronous RAG indexing, 2.1)
│     /api/projects/[id]/specifications (GET list, POST generate — Task 2.1)
│     /api/projects/[id]/specifications/[version] (GET one version — Task 2.1)
└── worker/               BullMQ workers, one dir per queue (spec, plan, code, deploy)
    └── public entry: src/index.ts
        deps: @aiflow/{db,queue,ai-roles} (declared; worker itself is a stub)

services/
├── model-router/         Express, port 3001. OpenAI-compatible facade over
│                         routerai/OpenAI/Anthropic, fallback chain, Redis cache.
│                         Stores no keys. Declared deps: express, ioredis (stub;
│                         `src/index.ts` is `export {};`, no crypto consumer yet)
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
├── crypto/               Declared but empty (`src/index.ts` is `export {};`).
│                         The AES-256-GCM helpers are not here yet; the
│                         `{"__encrypted__": ...}` envelope lives in
│                         `packages/db/src/config-types.ts` (ENCRYPTED_TAG)
├── ai-roles/             Model provider adapter (Task 1.3; embeddings + universal
│                         provider in Task 2.1). Leaf package.
│                         └── public entry: src/index.ts
│                             types.ts — ChatRole, ChatMessage, ChatConfig,
│                               ChatResult (nullable token counts), ModelProvider
│                               (chat()), StreamingProvider (+ chatWithUsage()),
│                               EmbeddingsProvider (embed()), OpenAICompatibleProvider
│                               (extends both), ProviderConfig
│                             openai-compatible.ts — createOpenAICompatibleProvider:
│                               parameterized ${baseURL}/chat/completions streaming +
│                               /embeddings; mock path when no key (canned chat,
│                               deterministic 768-dim embeddings)
│                             env-provider.ts — createProviderFromEnv() /
│                               readProviderConfigFromEnv(): the app seam; one
│                               OpenAI-compatible provider from OPENAI_* env
│                               (LM Studio, z.ai, OpenAI — same factory);
│                               createZaiProvider() is a deprecated alias
│                             mock-chat.ts / mock-embeddings.ts — extracted mock paths
│                             sse-parser.ts — generic SSE frame reassembly
│                               (reusable; reader released in finally)
└── ui/                   Design system (Task 1.2d). Primitives: Button, Input +
                          Field, Card + CardTitle/CardDescription, Spinner.
                          └── public entry: src/index.ts (components) and
                              @aiflow/ui/styles/theme.css (the @theme tokens).
                              deps: clsx, tailwind-merge, cva. React is a peer.
                              No build step — apps/web transpiles the source.
                              cn() in src/lib/cn.ts is the only shared helper.

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

| Concern                                                            | Where                                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Auth helpers (`requireUser`, `requireProMode`, `canAccessProject`) | `apps/web/src/features/auth` (Task 1.2a)                               |
| Per-route project access gate (`resolveProjectSchema`)             | `apps/web/src/features/projects/model/access.ts` (Task 2.1)            |
| Projects CRUD + schema provisioning                                | `apps/web/src/features/projects` (Task 1.2b)                           |
| Analyst chat (SSE streaming + history, RAG-augmented)              | `apps/web/src/features/chat` (Task 1.3; RAG in Task 2.1)               |
| File upload + RAG indexing + retrieval                             | `apps/web/src/features/files` (Task 2.1)                               |
| SPEC.md version list, view, generation                             | `apps/web/src/features/specifications` (Task 2.1)                      |
| Model provider adapter (universal OpenAI-compatible, chat+embed)   | `packages/ai-roles/src` (Task 1.3; universal + embeddings in Task 2.1) |
| App shell (header, side menu)                                      | `apps/web/src/shared/ui` (Task 1.2a)                                   |
| MinIO object storage client                                        | `apps/web/src/shared/minio` (Task 2.1)                                 |
| UI primitives + design tokens                                      | `packages/ui/src` (Task 1.2d)                                          |
| Prisma client factory                                              | `packages/db/src/index.ts`                                             |
| Queue definitions                                                  | `packages/queue/src`                                                   |
| Encryption helpers (envelope typing)                               | `packages/db/src/config-types.ts` (`packages/crypto` is an empty stub) |
| Gitea client                                                       | `apps/web/src/shared/gitea` (planned)                                  |
| Env validation                                                     | `.env.example` + `apps/web/src/shared/env` (planned)                   |

## Rules that keep it readable

- One `index.ts` per package is the only public surface; `import/no-internal-modules`
  enforces it. `apps/web` features export through their slice `index.ts` (§ 2.2).
  `tools/*` are exempt: they are executables, not libraries, and expose a `bin`
  entry rather than an importable surface.
- Generated clients (`packages/db/generated/*`) and `next-env.d.ts` are build
  artifacts, gitignored, and exempt from the size rules.
- `packages/crypto` is declared but empty until its consumers arrive;
  `packages/ai-roles`, `packages/db`, and `packages/ui` are real (ai-roles
  shipped in Task 1.3; Task 2.1 generalized it into a universal
  OpenAI-compatible provider with embeddings).
- **`packages/ui` is a deliberate exception to the § 2.3 promotion test.** That
  rule says a slice used by one app stays a slice, and `apps/web` is still the
  only consumer. It was overridden by decision in Task 1.2d: the design system is
  foundational rather than incidental, and retrofitting tokens across screens
  built without them costs more than the build wiring saves. Recorded in
  conventions § 2.3 and decisions #10 — the rule still holds everywhere else.
- The boundary inside that exception: `packages/ui` holds **primitives and
  tokens** — no knowledge of this app. App **composition** (header, side menu)
  stays in `apps/web/src/shared/ui`, because it encodes this app's routes and a
  shared package must not know them.
