# AI Studio — Code Map

One line per package / slice: what it owns, its public entry point, its
dependencies. The file that lets a session act without re-deriving the
structure by search. Layout per A4 in
[14-decisions-needed.md](14-decisions-needed.md).

```
apps/
├── web/                  Next.js (App Router, TS strict, Tailwind v4)
│                         └── public entry: src/app, src/features/*
│                             deps: @aiflow/{db,queue,ai-roles,ui,crypto}
│                             layout: app/ (routing only) → features/ →
│                                     shared/ → packages/ (§ 2.2)
│                             scripts/ingest-repo.ts — `yarn workspace
│                               @aiflow/web docs:ingest`: stable project schema
│                               (`.local/dev-rag.json`) + index docs/state +
│                               filtered source + `.claude` prompts for agent RAG;
│                               scripts/rag-mcp.ts + rag-query.ts (MCP `aiflow-rag`)
│   features:
│     ├── auth/           NextAuth v5, guards, session (Task 1.2a)
│     ├── projects/       Projects CRUD + schema provisioning (Task 1.2b)
│     │                     └── public entry: src/index.ts
│     │                         model/service.ts — create/list/get/remove over
│     │                           ProjectMeta; create is a compensation saga
│     │                           (schema → Gitea repo+README → meta.create;
│     │                           deleteRepo+dropProjectSchema on failure).
│     │                           model/gitea-provision.ts — owner resolve +
│     │                           createRepo/README helpers (@/shared/gitea)
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
│     │                     └── public: `index.ts` (server) + `client.ts` (ChatPanel)
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
│     │                     └── public: `index.ts` (CRUD), `client.ts` (FilePanel),
│     │                         `rag.ts` (retrieve/extract/chunk — kept off index so
│     │                         Researcher never webpacks pdf-parse/pdfjs-dist)
│     │                         model/service.ts — createUserFile/listFiles over
│     │                           UserFile + linked Document (atomic nested create);
│     │                         model/index-service.ts — indexDocument: MinIO bytes
│     │                           → extractText → chunkText → embed → atomic chunk
│     │                           replace in a $transaction (embedding written via
│     │                           $executeRaw '[...]'::vector; never leaves INDEXING);
│     │                         model/retrieve.ts — retrieveContext/retrieveChunks:
│     │                           pgvector cosine top-k ($queryRawUnsafe, k=$1),
│     │                           JOIN Document.title as `path` for citation,
│     │                           never throws (degrades to '' on embed failure);
│     │                         model/extract.ts (pdf-parse text layer) + chunk.ts
│     │                           (LlamaIndex SentenceSplitter 512/50, toVectorLiteral)
│     │                         ui/FilePanel.tsx — upload (hidden input) + per-row
│     │                           index trigger + status badge
│     ├── specifications/ SPEC.md version list, view, generation, approve (Task 2.1 + UX)
│     │                     └── public: `index.ts` (server) + `client.ts` (panels)
│     │                         model/service.ts — listSpecifications /
│     │                           getSpecificationByVersion (findFirst: version
│     │                           @@unique but deletedAt not in it) /
│     │                           createSpecificationVersion (max+1, createdBy AI) /
│     │                           approveSpecification (approvedAt/approvedBy,
│     │                           idempotent);
│     │                         model/generate.ts — generateSpecification(schemaName,
│     │                           deps): non-streaming generation via DI (cross-slice
│     │                           listMessages/retrieveContext/readSpecTemplate
│     │                           injected — boundaries/dependencies capture:slice
│     │                           forbids feature→feature imports)
│     │                         ui/ — SpecificationPanel (version list),
│     │                           SpecPreviewPanel (Markdown + Approve / Start)
│     ├── model-config/   Analyst ModelConfig encrypt/API/UI (Task 2.3)
│     │                     └── public: `index.ts` (server) + `client.ts` (form)
│     │                         model/service.ts — get/upsert Analyst config;
│     │                           encrypt full JSON blob via @aiflow/crypto;
│     │                           public DTO never includes plaintext apiKey;
│     │                           soft-delete filter on ModelConfig
│     │                         model/resolve-provider.ts — project key →
│     │                           createOpenAICompatibleProvider, else env
│     │                         ui/ — settings form (Russian), Pro-only page
│     ├── deploy/         Manual deploy: templates, enqueue, UI (Task 2.3)
│     │                     └── public: `index.ts` (server) + `client.ts` (panel)
│     │                         model/templates.ts — Dockerfile + compose render
│     │                           (`aistudio-project-{shortId}`, port 3000)
│     │                         model/export.ts — optional Gitea Contents commit
│     │                         model/service.ts — create Deployment+Meta (same
│     │                           uuid), getDeployQueue().add — **no dockerode**
│     │                         ui/DeploymentsPanel — list/poll/log; Pro Build
│     └── editor/         Pro code editor over Gitea (Task 2.2)
│                           └── public: `index.ts` (server) + `client.ts` (EditorShell)
│                               model/access.ts — resolveEditorContext (owner +
│                                 soft-delete + lazy Gitea provision) +
│                                 assertProApiUser (403 JSON; pages use
│                                 requireProMode redirect instead)
│                               model/provision.ts — ensureGiteaProvisioned mutex +
│                                 README stub for old projects with null gitea*
│                               model/service.ts barrel — listTree / getFileContent /
│                                 commitFiles / createPath|deletePath|renamePath /
│                                 listCommits / getDiff (via tree/commit/paths/history)
│                               model/http.ts — gateEditorRequest + mapEditorError
│                               model/ws-hub.ts + ws-publish.ts — in-memory Hub;
│                                 REST publishSaved / publishTreeChanged
│                               model/ws-attach.ts — upgrade handler; exported
│                                 from barrel for `apps/web/server.ts` (custom
│                                 HTTP server; not an App Router route)
│                               ui/ — Monaco shell, FileTree, tabs, Git panel,
│                                 terminal stub; hooks useEditorState / useTabs /
│                                 useEditorWs; client fetch in ui/api.ts
│   shared:
│     ├── ui/             AppHeader + AppNav (horizontal top nav; Task 1.2a / UX)
│     ├── minio/          MinIO client: putObject/getObject/ensureBucket, lazy
│     │                    singleton, scheme-less S3_ENDPOINT tolerated (Task 2.1)
│     └── gitea/          Gitea REST v1 client (Task 2.2): createRepo/deleteRepo/
│                          getTree/getFile/createOrUpdateFile/deleteFile/
│                          listCommits/getCommitDiff/getAuthenticatedUser;
│                          fetch-only, GiteaUpstreamError → routes map to 502
│   routes (app/):
│     /  → redirect('/projects');  /projects, /projects/new, /projects/[id]
│     /projects/[id]/research — three-column Researcher (artifacts | chat | SPEC
│       preview); ResearchWorkspace owns SPEC state; Create above composer;
│       Approve + Start generation → /tasks
│     /projects/[id]/tasks — Tasks stub until Planner / plan:generate (MVP-1)
│     /projects/[id]/editor — Pro Monaco editor (Task 2.2; requireProMode)
│     /projects/[id]/settings/models — Pro Analyst ModelConfig (Task 2.3)
│     /projects/[id]/deployments — build history; Pro «Собрать» (Task 2.3)
│     /api/projects (GET list, POST create), /api/projects/[id] (GET, DELETE)
│     /api/projects/[id]/chat (POST — SSE-streamed Analyst reply, Task 1.3;
│       RAG context mixed into the system prompt since Task 2.1;
│       ModelConfig → env provider resolve since Task 2.3)
│     /api/projects/[id]/files (GET list, POST upload — Task 2.1)
│     /api/projects/[id]/files/[fid]/index (POST — synchronous RAG indexing, 2.1)
│     /api/projects/[id]/specifications (GET list, POST generate — Task 2.1)
│     /api/projects/[id]/specifications/[version] (GET one version — Task 2.1)
│     /api/projects/[id]/specifications/[version]/approve (POST — set approvedAt)
│     /api/projects/[id]/model-config (GET/PUT — Pro Analyst config, Task 2.3)
│     /api/projects/[id]/deploy/export (POST — Dockerfile/compose → Gitea, 2.3)
│     /api/projects/[id]/deployments (GET list; POST enqueue deploy:run, 2.3)
│     /api/projects/[id]/deployments/[deploymentId] (GET detail+log, 2.3)
│     /api/projects/[id]/editor/{tree,file,commits,diff} (GET — Task 2.2)
│     /api/projects/[id]/editor/commit (POST), /editor/files (POST/DELETE),
│       /editor/files/rename (POST — Task 2.2)
│     WS /api/projects/[id]/editor/ws — custom server (`apps/web/server.ts` +
│       `ws`); session cookie; non-Pro → close 4403 (Task 2.2)
│     /api/health (GET — compose liveness; no auth)
└── worker/               BullMQ workers (Task 2.3: deploy:run real; others stub)
    └── public entry: src/index.ts
        deps: @aiflow/{db,queue}, bullmq, dockerode (MIT; **worker only**),
          tar-fs. docker.sock mount in compose is **DEV-ONLY** (OQ #4).
        src/deploy/handler.ts — clone Gitea → dockerode.buildImage →
          Deployment/Meta DEPLOYED|FAILED; stub url `local://image/{tag}`

services/
├── model-router/         Express, port 3001. OpenAI-compatible facade over
│                         routerai/OpenAI/Anthropic, fallback chain, Redis cache.
│                         Stores no keys. Declared deps: express, ioredis (stub;
│                         `src/index.ts` is `export {};`, no crypto consumer yet)
└── registry-proxy/       Sandbox egress filter (allowlist). Task 3.1. deps: none

packages/
├── db/                   Prisma schemas + generated clients
│                         ├── prisma/schema.prisma        → public schema
│                         │     ProjectMeta holds nullable Gitea identity
│                         │     (giteaOwner/giteaRepo/giteaDefaultBranch; Task 2.2)
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
├── queue/                BullMQ definitions (Task 2.3, real): four queue names,
│                         Redis connection from REDIS_URL, getDeployQueue(),
│                         typed DeployRunPayload, attempts:1 for deploy builds.
│                         Producer helpers only — no dockerode, no workers here.
├── crypto/               AES-256-GCM leaf (Task 2.3): `encrypt` / `decrypt` /
│                         `readEncryptionKey`. Envelope
│                         `{"__encrypted__": base64(iv||tag||ciphertext)}`.
│                         Typed as `ModelConfigValue` (= `EncryptedValue`) in
│                         `packages/db/src/config-types.ts`
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
└── ui/                   Design system (Task 1.2d → D0a OpenUI). OpenUI-backed
                          wrappers: Button, Input + Field, Card + CardTitle/
                          CardDescription; Spinner remains local.
                          └── public entry: src/index.ts (components) and
                              @aiflow/ui/styles/theme.css (the @theme tokens).
                              deps: @openuidev/react-ui, clsx, tailwind-merge,
                              cva. Peers: react, react-dom, openui headless/lang,
                              zustand, zod. No build step — apps/web transpiles.
                              cn() in src/lib/cn.ts is the only shared helper.
                              Brand OpenUI tokens: unlayered `:root` overrides in
                              apps/web globals.css (no ThemeProvider — Next.js
                              rejects OpenUI's barrel `export *` + `use client`).

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

docker/                   Compose helpers (not a Yarn workspace).
├── postgres/init/        CREATE EXTENSION vector, pgcrypto (first-boot only)
└── dev-entrypoint.sh     Shared Node-service entrypoint: flock → yarn install
                          when stamp/lock/node_modules need it → prisma generate
                          (skip if clients present) → migrate deploy when
                          ROLE=app → exec. registry-proxy is NO_EGRESS and
                          depends_on app healthy so install never runs without
                          network.

compose topology          `docker compose up` (no `--build`): postgres, redis,
                          minio, gitea + four Node services on node:22-bookworm.
                          Bind mount `.` → `/workspace`; named volumes for each
                          workspace `node_modules` + Yarn/Corepack cache. Stubs
                          keep `tsx watch`; only `app` has a healthcheck
                          (`GET /api/health`). `registry-proxy` is sandbox-only
                          (`NO_EGRESS`, `depends_on` app healthy).
```

## Cross-cutting

| Concern                                                            | Where                                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Auth helpers (`requireUser`, `requireProMode`, `canAccessProject`) | `apps/web/src/features/auth` (Task 1.2a)                               |
| Per-route project access gate (`resolveProjectSchema`)             | `apps/web/src/features/projects/model/access.ts` (Task 2.1)            |
| Projects CRUD + schema provisioning                                | `apps/web/src/features/projects` (Task 1.2b)                           |
| Analyst chat (SSE streaming + history, RAG-augmented)              | `apps/web/src/features/chat` (Task 1.3; RAG in Task 2.1)               |
| File upload + RAG indexing + retrieval                             | `apps/web/src/features/files` (Task 2.1)                               |
| Dev-time repo RAG MCP (`aiflow-rag` search/status)                 | `apps/web/scripts/{ingest-repo,rag-mcp,rag-query,dev-rag-shared}.ts`   |
| SPEC.md version list, view, generation                             | `apps/web/src/features/specifications` (Task 2.1)                      |
| Analyst ModelConfig (encrypt, API, settings UI)                    | `apps/web/src/features/model-config` (Task 2.3)                        |
| Manual deploy (templates, enqueue, deployments UI)                 | `apps/web/src/features/deploy` (Task 2.3); worker `deploy:run`         |
| Model provider adapter (universal OpenAI-compatible, chat+embed)   | `packages/ai-roles/src` (Task 1.3; universal + embeddings in Task 2.1) |
| App shell (header, top nav)                                        | `apps/web/src/shared/ui` (AppHeader, AppNav)                           |
| MinIO object storage client                                        | `apps/web/src/shared/minio` (Task 2.1)                                 |
| Gitea HTTP client (REST v1, fetch-only)                            | `apps/web/src/shared/gitea` (Task 2.2)                                 |
| Pro code editor (Monaco + Gitea files/git + in-memory WS hub)      | `apps/web/src/features/editor` (Task 2.2); WS via `apps/web/server.ts` |
| UI primitives + design tokens (OpenUI-backed)                      | `packages/ui/src` (Task 1.2d; OpenUI D0a)                              |
| OpenUI brand tokens (CSS `:root` overrides)                        | `apps/web/src/app/globals.css` (D0a; no ThemeProvider)                 |
| Prisma client factory                                              | `packages/db/src/index.ts`                                             |
| Queue definitions                                                  | `packages/queue/src`                                                   |
| Encryption helpers (AES-256-GCM + envelope typing)                 | `packages/crypto` + `packages/db/src/config-types.ts`                  |
| Gitea identity on `ProjectMeta` (owner/repo/branch)                | `packages/db` public schema (Task 2.2)                                 |
| Env validation                                                     | `.env.example` + `apps/web/src/shared/env` (planned)                   |

## Rules that keep it readable

- One `index.ts` per package is the only public surface; `import/no-internal-modules`
  enforces it. `apps/web` features export through their slice `index.ts` (§ 2.2).
  `tools/*` are exempt: they are executables, not libraries, and expose a `bin`
  entry rather than an importable surface.
- Generated clients (`packages/db/generated/*`) and `next-env.d.ts` are build
  artifacts, gitignored, and exempt from the size rules.
- `packages/crypto` and `packages/queue` are real (Task 2.3); `packages/ai-roles`,
  `packages/db`, and `packages/ui` are real (ai-roles shipped in Task 1.3;
  Task 2.1 generalized it into a universal OpenAI-compatible provider with
  embeddings). Worker `deploy:run` uses dockerode; **docker.sock is DEV-ONLY**.
- **`packages/ui` is a deliberate exception to the § 2.3 promotion test.** That
  rule says a slice used by one app stays a slice, and `apps/web` is still the
  only consumer. It was overridden by decision in Task 1.2d: the design system is
  foundational rather than incidental, and retrofitting tokens across screens
  built without them costs more than the build wiring saves. Recorded in
  conventions § 2.3 and decisions #10 — the rule still holds everywhere else.
- The boundary inside that exception: `packages/ui` holds **primitives and
  tokens** — no knowledge of this app. App **composition** (header, top nav)
  stays in `apps/web/src/shared/ui`, because it encodes this app's routes and a
  shared package must not know them.
