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
│                             client state (D0f): OpenUI owns chat store
│                               (zustand peer only); panels are local
│                               useState+fetch islands; ProjectIdContext only
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
│     │                           (schema → Gitea repo + user-nextjs template → meta.create;
│     │                           deleteRepo+dropProjectSchema on failure).
│     │                           model/gitea-provision.ts — owner resolve +
│     │                           createRepo + seedUserTemplate (@/shared/gitea)
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
│     ├── chat/           Analyst chat — AG-UI streaming + threads (Task 1.3 → chat Phase 1)
│     │                     └── public: `index.ts` (server) + `client.ts` (ChatPanel legacy)
│     │                         model/service.ts — listMessages(ByThread)/saveMessage/
│     │                           deleteMessage over ChatMessage (project-scoped, soft-delete)
│     │                         model/threads.ts — ChatThread CRUD + forkThread +
│     │                           createThreadWithMessage (title from first msg)
│     │                         model/agui-mappers.ts — ChatMessageView/ChatThreadView ↔
│     │                           AG-UI wire (AguiMessage/AguiThread) for restStorage
│     │                         model/schema.ts — readSystemPrompt() reads
│     │                           .claude/agents/analyst.md per turn; withRagContext()
│     │                           appends RAG context; readSpecTemplate() extracts the
│     │                           SPEC.md template block for generation
│     │                         ui/agui/ — grown-up chat on OpenUI AgentInterface (Phase 1):
│     │                           AguiChatPanel (ChatProvider+AgentInterface, RU labels,
│     │                           components slot for custom message renderers),
│     │                           llm.ts (ChatLLM bridge → /threads/{tid}/run, agUIAdapter),
│     │                           storage.ts (custom ThreadStorage → /threads REST), labels.ts
│     │                           messages/ — per-message actions (Stage A): AguiAssistantMessage
│     │                             (markdown + copy/regenerate), AguiUserMessage (edit/delete),
│     │                             MessageActions bar, MessageEditor, icons (inline SVG),
│     │                             api.ts (PATCH/DELETE persistence), project-context (projectId)
│     │                           threads/ — custom sidebar thread list (Stage B): AguiThreadList
│     │                             (replaces default ThreadList, loads on mount), ThreadRow +
│     │                             ThreadRowMenu (Radix DropdownMenu: rename/fork/delete) +
│     │                             ThreadRenameForm (inline), useThreadActions (rename/fork
│     │                             handlers), api.ts (forkThreadRest → /fork)
│   (shell)/projects/[id]/_shell/ — project shell composition (Stage D, app-level):
│     ProjectShell (AgentInterface = home: chat + sidebar threads + tool nav +
│     Route panels). `buildProjectRoutes()` returns a **flat array** of
│     `AgentInterface.Route` as direct children (OpenUI slot extract is shallow —
│     a wrapper component leaves routes empty). SidebarNav (Files/Tasks/Deploy/
│     SPEC/Models + Editor link). Co-located with the home route, not a feature
│     slice — it composes panels across slices.
│   shared/spec-approve-button.tsx — shared «Утвердить» POST to
│     /specifications/{v}/approve (preview card, detail panel, Spec route).
│   shared/spec-artifact-renderer.tsx — OpenUI artifact renderer for SPEC.md
│     (Stage C): defineArtifactRenderer type:spec, toolName:spec:generate; parser
│     reads tool result {id,version,content}; preview = card + Approve; actual =
│     markdown + Approve
│   shared/chat-project-context.ts — ProjectIdContext (projectId to message
│     components + spec renderer; shared so chat & specifications slices both
│     consume without a feature→feature import)
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
│     │                         ui/FilePanel.tsx — list + upload; FileRow +
│     │                           file-panel-upload for per-row index / POST
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
│     │                         ui/ — SpecRoute panels live in project shell
│     │                           (_shell); legacy SpecificationPanel /
│     │                           SpecPreviewPanel removed (D0f cleanup)
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
│     ├── tasks/          Roadmap + plan/code enqueue (Tasks 3.2–3.3 + 4.1)
│     │                     └── public: `index.ts` (server) + `client.ts` (panel)
│     │                         model/service.ts — listTasks / enqueuePlan
│     │                           (approved Specification required; getPlanQueue)
│     │                         model/execute.ts — enqueueExecute / enqueueConfirm
│     │                           (getCodeQueue; Gitea context; status gates)
│     │                         model/run-plan.ts — enqueue unblocked PENDING DAG
│     │                         model/detail.ts — getTaskDetail + TaskLog
│     │                         model/access.ts — assertProPlan / assertProCode
│     │                         model/ws-attach.ts — Redis `sandbox:logs:{taskId}`
│     │                         ui/TasksPanel + ExecuteControls + TaskLogPanel +
│     │                           ReviewVerdictCard (parses `=== REVIEW ===` log)
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
│                                 terminal stub; hooks useEditorState (composes
│                                 useEditorTree / useEditorChrome /
│                                 useEditorDialogs / useEditorWsSideEffects /
│                                 useTabs); client fetch in ui/api.ts
│   shared:
│     ├── ui/             AppHeader + AppNav (horizontal top nav; Task 1.2a / UX)
│     ├── hooks/          usePollWhile + useProjectResourceList (D0f islands)
│     ├── minio/          MinIO client: putObject/getObject/ensureBucket, lazy
│     │                    singleton, scheme-less S3_ENDPOINT tolerated (Task 2.1)
│     └── gitea/          Gitea REST v1 client (Task 2.2): createRepo/deleteRepo/
│                          getTree/getFile/createOrUpdateFile/deleteFile/
│                          listCommits/getCommitDiff/getAuthenticatedUser;
│                          seedUserTemplate (user-nextjs → Gitea, OQ #1);
│                          fetch-only; token from GITEA_ADMIN_TOKEN_FILE or
│                          GITEA_ADMIN_TOKEN; GiteaUpstreamError → routes map to 502
│   routes (app/):
│     (app)/ — auth-guarded shell with AppHeader for non-project screens:
│       /  → redirect('/projects');  /projects (list), /projects/new
│     (shell)/ — full-bleed shell (no AppHeader, AgentInterface owns 100dvh)
│       for project screens; auth-guarded. Stage D.
│       /projects/[id] — HOME = ProjectShell (grown-up chat = app shell):
│         sidebar = threads (AguiThreadList) + tool nav (SidebarNav: Files/
│         Tasks/Deploy/SPEC/Models + Editor link); Route panels via
│         `buildProjectRoutes` (flat AgentInterface.Route children — OpenUI
│         slot extract is shallow); chat = default view (path=undefined).
│         _shell/ co-located module (app-level composition, not a feature
│         slice — composes panels across slices, which the boundaries policy
│         forbids feature→feature).
│       /projects/[id]/chat — redirect → home (legacy preview)
│       /projects/[id]/research — redirect → home (legacy three-column removed)
│       /projects/[id]/tasks, /deployments, /editor, /settings/models — full
│         pages (Editor is separate: Monaco+WS stay off the chat shell)
│     /api/projects (GET list, POST create), /api/projects/[id] (GET, DELETE)
│     /api/projects/[id]/threads (GET list, POST create — AG-UI restStorage, chat Phase 1)
│     /api/projects/[id]/threads/[tid] (GET messages, PATCH rename, DELETE — Phase 1)
│     /api/projects/[id]/threads/[tid]/run (POST — thin bridge: save USER,
│       enqueue `chat-run`, Redis→SSE for AG-UI events; OpenUI client unchanged.
│       Worker owns multi-turn tool loop + tool handlers; Redis channel
│       `chat:run:{runId}` is disposable — final ASSISTANT text is in Postgres)
│     /api/projects/[id]/threads/[tid]/messages/[mid] (PATCH edit content,
│       DELETE soft-delete — per-message actions persistence, Stage A)
│     /api/projects/[id]/threads/[tid]/fork (POST — copy thread + messages into
│       a forkedFromId-linked branch; Stage B)
│     /api/projects/[id]/files (GET list, POST upload — Task 2.1)
│     /api/projects/[id]/files/[fid]/index (POST — synchronous RAG indexing, 2.1)
│     /api/projects/[id]/specifications (GET list, POST generate — Task 2.1)
│     /api/projects/[id]/specifications/[version] (GET one version — Task 2.1)
│     /api/projects/[id]/specifications/[version]/approve (POST — set approvedAt)
│     /api/projects/[id]/model-config (GET/PUT — Pro Analyst config, Task 2.3)
│     /api/projects/[id]/deploy/export (POST — Dockerfile/compose → Gitea, 2.3)
│     /api/projects/[id]/deployments (GET list; POST enqueue deploy:run, 2.3)
│     /api/projects/[id]/deployments/[deploymentId] (GET detail+log, 2.3)
│     /api/projects/[id]/tasks (GET list — Task 3.2)
│     /api/projects/[id]/tasks/plan (POST enqueue plan:generate — Pro, 3.2)
│     /api/projects/[id]/tasks/run-plan (POST live-enqueue ready PENDING — Pro)
│     /api/projects/[id]/tasks/[taskId] (GET detail+logs — Task 3.3)
│     /api/projects/[id]/tasks/[taskId]/execute (POST dryRun? — Pro, 3.3)
│     /api/projects/[id]/tasks/[taskId]/confirm (POST after dry-run — Pro, 3.3)
│     /api/projects/[id]/editor/{tree,file,commits,diff} (GET — Task 2.2)
│     /api/projects/[id]/editor/commit (POST), /editor/files (POST/DELETE),
│       /editor/files/rename (POST — Task 2.2)
│     WS /api/projects/[id]/editor/ws — custom server (`apps/web/server.ts` +
│       `ws`); session cookie; non-Pro → close 4403 (Task 2.2)
│     WS /api/projects/[id]/tasks/[taskId]/logs/ws — Redis sandbox logs (3.3)
│     /api/health (GET — compose liveness; no auth)
└── worker/               BullMQ workers (deploy-run + plan-generate +
    │                     code-execute + code-review + chat-run real;
    │                     spec-generate dormant stub-ack — SPEC generation
    │                     runs inside chat-run tools)
    └── public entry: src/index.ts
        deps: @aiflow/{db,queue,ai-roles,crypto}, bullmq, dockerode (MIT; **worker only**),
          tar-fs. docker.sock mount in compose is **DEV-ONLY** (OQ #4).
        src/deploy/handler.ts — clone Gitea → prisma db push into `app_{hex}` →
          dockerode.buildImage → DEPLOYED|FAILED; url `docker://{tag}` + run hint
        src/plan/handler.ts — load approved Specification → generatePlanTasks
          (env provider) → soft-delete replaceable tasks → Task+deps+TaskLog
        src/code/handler.ts — code:execute: claim/resume (MVP-3 A1/A2) + dry-run →
          AWAITING_REVIEW, live → step pipeline (CLONE…DONE) + sandbox + PARSE
          checkpoint ref then push + enqueue code-review
        src/code/claim.ts — resolveCodeClaim (skip DONE, pipeline-complete,
          resumeFrom from TaskLog+headCommit, fresh claim → CLONE)
        src/code/pipeline{,-live,-steps}.ts — step encoding + live runner
        src/code/git-checkpoint.ts — refs/aistudio/task/{id} push/restore (A2)
        src/review/handler.ts — code-review one-shot LLM Reviewer (MVP-2 4.1):
          generateReviewVerdict → TaskLog `=== REVIEW ===` JSON;
          ACCEPTED → FF into main → DONE → enqueue next ready tasks;
          REJECTED→PENDING (Self-Refine → MVP-3 C1)
        src/deploy/claim.ts — resolveDeployClaim (skip DEPLOYED, reject FAILED)
        src/deploy/status.ts — finishDeploy only from BUILDING (A1 dedup)
        src/chat/ — chat-run multi-turn AG-UI tool loop; Redis publish
          `chat:run:{runId}`; tools via db+queue+crypto (no apps/web imports)
        src/gitea-token.ts — GITEA_ADMIN_TOKEN_FILE then GITEA_ADMIN_TOKEN
          (compose gitea-init writes `/run/gitea/token`)
        src/sandbox/ — createContainer options builder (Task 3.1 hardening,
          secret-file api_key bind, SANDBOX_NETWORK / AIDER_SANDBOX_IMAGE)

services/
├── model-router/         Express, port 3001. OpenAI-compatible facade over
│                         routerai/OpenAI/Anthropic, fallback chain, Redis cache.
│                         Stores no keys. Declared deps: express, ioredis (stub;
│                         `src/index.ts` is `export {};`, no crypto consumer yet)
└── registry-proxy/       Sandbox egress allowlist proxy (Task 3.1). Express +
                          CONNECT; ALLOWED_HOSTS; GET /health; PORT 3128.
                          public entry: src/index.ts

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
│                             schema-executor.ts — createProjectSchema/dropProjectSchema
│                             (create = from-empty DDL in a tx) + ensureThreadSchema
│                             (idempotent backfill of ChatThread + threadId/parentId
│                             for schemas created before chat Phase 1; also seeds a
│                             "Главный" thread and links orphan messages)
│                             task-git-backfill.ts — ensureTaskGitColumns (branchName/
│                             headCommit/mergedAt). app-schema.ts — `app_{hex}` schema
│                             for generated user apps (db push at deploy; OQ #2).
│                             scripts/backfill-threads.ts — one-off runner over all
│                             project schemas. `yarn workspace @aiflow/db backfill:threads`
│                             scripts/seed-dev-user.ts — a Credentials login for
│                             local dev; refuses a non-local DATABASE_URL.
│                             `yarn workspace @aiflow/db seed:dev-user`
├── queue/                BullMQ definitions (Tasks 2.3–3.3 + 4.1 + D0g): six
│                         queue names (hyphenated; incl. chat-run, code-review),
│                         Redis connection from REDIS_URL, getDeployQueue() /
│                         getPlanQueue() / getCodeQueue() / getReviewQueue() /
│                         getChatRunQueue(), typed payloads +
│                         sandboxLogsChannel() / chatRunChannel(). Producer
│                         helpers only — no dockerode, no workers here.
├── crypto/               AES-256-GCM leaf (Task 2.3): `encrypt` / `decrypt` /
│                         `readEncryptionKey`. Envelope
│                         `{"__encrypted__": base64(iv||tag||ciphertext)}`.
│                         Typed as `ModelConfigValue` (= `EncryptedValue`) in
│                         `packages/db/src/config-types.ts`
├── ai-roles/             Model provider adapter (Task 1.3; embeddings + universal
│                         provider in Task 2.1). Leaf package.
│                         └── public entry: src/index.ts
│                             types.ts — ChatRole (incl. TOOL), ChatMessage
│                               (+ toolCalls / toolCallId), ChatConfig,
│                               ChatResult (nullable token counts), ModelProvider
│                               (chat()), StreamingProvider (+ chatWithUsage /
│                               chatWithTools), EmbeddingsProvider (embed()),
│                               OpenAICompatibleProvider; api-messages.ts —
│                               buildApiMessages (assistant tool_calls + role tool)
│                               (extends both), ProviderConfig
│                             openai-compatible.ts — createOpenAICompatibleProvider:
│                               parameterized ${baseURL}/chat/completions streaming +
│                               /embeddings; mock path when no key (canned chat,
│                               deterministic 768-dim embeddings)
│                             env-provider.ts — createProviderFromEnv() /
│                               readProviderConfigFromEnv(): the app seam; one
│                               OpenAI-compatible provider from OPENAI_* env
│                               (LM Studio, z.ai, OpenAI — same factory)
│                             mock-chat.ts / mock-embeddings.ts — extracted mock paths
│                             planner-prompt.ts / planner.ts — PLANNER_SYSTEM_PROMPT
│                               + generatePlanTasks (JSON parse, max 2 retries,
│                               effort S|M|L, max 24 tasks; 3.2)
│                             reviewer-prompt.ts / reviewer.ts / reviewer-parse.ts —
│                               REVIEWER_SYSTEM_PROMPT + generateReviewVerdict
│                               (JSON object parse, max 2 retries; MVP-2 4.1)
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
├── aider-sandbox/        Aider sandbox image (Task 3.1): Dockerfile + runner.js
│                         (+ runner-checks/gate). CODER_CORE_PROMPT mirrors
│                         docs/07 core; template-free; API key via
│                         /run/secrets/api_key; commits only after gate passes.
└── dev-entrypoint.sh     Shared Node-service entrypoint: flock → yarn install
                          when stamp/lock/node_modules need it → prisma generate
                          (skip if clients present) → migrate deploy when
                          ROLE=app → exec. registry-proxy is NO_EGRESS and
                          depends_on app healthy so install never runs without
                          network.

templates/                User-project scaffolds (not Yarn workspaces).
└── user-nextjs/          Minimal Next.js App Router + TS + Prisma. Copied to
                          Gitea on project create (and on first codegen if the
                          repo is still README-only) (OQ #1).

compose topology          `docker compose up` (no `--build`): postgres, redis,
                          minio, gitea, **gitea-init** (idempotent admin user +
                          token → volume `gitea_bootstrap` `/run/gitea/token`) +
                          four Node services on node:22-bookworm. Bind mount
                          `.` → `/workspace`; named volumes for each workspace
                          `node_modules` + Yarn/Corepack cache. App binds via
                          `LISTEN_HOST=0.0.0.0` (not Docker `HOSTNAME`) so the
                          `127.0.0.1` healthcheck works. `app`/`worker` read
                          `GITEA_ADMIN_TOKEN_FILE`. `registry-proxy` is
                          sandbox-only (`NO_EGRESS`, `depends_on` app healthy).
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
| Roadmap tasks + plan/code enqueue + live sandbox logs WS           | `apps/web/src/features/tasks` (3.2–3.3); worker `plan`/`code`          |
| Model provider adapter (universal OpenAI-compatible, chat+embed)   | `packages/ai-roles/src` (Task 1.3; universal + embeddings in Task 2.1) |
| App shell (header, top nav)                                        | `apps/web/src/shared/ui` (AppHeader, AppNav)                           |
| MinIO object storage client                                        | `apps/web/src/shared/minio` (Task 2.1)                                 |
| Gitea HTTP client (REST v1, fetch-only; token file or env)         | `apps/web/src/shared/gitea` (Task 2.2); worker `gitea-token.ts`        |
| Gitea bootstrap after volume wipe                                  | `docker/gitea/bootstrap.sh` + compose `gitea-init`                     |
| App HTTP bind (`LISTEN_HOST` / `HOST`, never Docker `HOSTNAME`)    | `apps/web/server.ts`                                                   |
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

## Planned — MVP-3 (not yet in the tree)

The agent-maturity phase ([04-roadmap.md](04-roadmap.md) § 5; decisions E1–E4 in
[14-decisions-needed.md](14-decisions-needed.md)) will add these. Rows marked
**done** are already in the tree; the rest are not — this section exists so the
next session does not re-derive the integration points. Each lands in its own
branch.

| Planned entity / change                                                    | Track                  | Where it will live                                                                                       |
| -------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Idempotent `code:execute` / `deploy:run` (claim + headCommit/finish dedup) | A1 **done 2026-08-23** | `apps/worker/src/code/{handler,claim,status}.ts`, `apps/worker/src/deploy/{handler,claim,status}.ts`     |
| Step-encoded resumable pipeline (`CLONE…DONE` + checkpoint ref)            | A2 **done 2026-08-23** | `apps/worker/src/code/pipeline{,-live,-steps,}.ts`, `git-checkpoint.ts`; TaskLog step markers            |
| `AuditEvent` model (append-only, role/action/target/traceId)               | A3                     | `packages/db/prisma/schema.prisma` (public); `recordAudit()` in worker; Pro UI event feed in `apps/web`  |
| Role policy guard (capability set)                                         | A4                     | `packages/ai-roles/src/policy.ts`; enforced inside the provider wrapper                                  |
| Langfuse service                                                           | B1                     | `docker-compose.yml` (new service, Postgres-backed)                                                      |
| LLM-call tracing wrapper                                                   | B2                     | `packages/ai-roles/src/openai-compatible.ts` (the single chokepoint); `traceId` → `TaskLog`/`AuditEvent` |
| Evals framework + CI job on prompt change                                  | B3                     | Promptfoo or Langfuse datasets; CI fires on `.claude/agents/**` change                                   |
| Prompt-injection red-team set                                              | B4                     | CI red-team (AgentDojo/InjecAgent-style) against the Analyst `withRagContext` surface                    |
| `code:review` Self-Refine loop (retry cap + AgentMemory feedback)          | C1                     | `apps/worker/src/review/` already one-shot (4.1); C1 adds auto re-enqueue code-execute ≤N                |
| `AgentMemory` model (task/role/lesson)                                     | C2                     | `packages/db/prisma/schema_project_template.prisma`; mixed into Coder + Reviewer prompts                 |
| `services/model-router` runtime (escalation as 2nd routed request)         | C3                     | `services/model-router/src` (currently `export {};` stub); `ModelConfig.config` gains `advisor` per role |
| Optional Planner Tree-of-Thoughts mode                                     | C4                     | `packages/ai-roles/src/planner.ts`; behind a flag                                                        |
| Reviewer verdict UI                                                        | D1                     | `apps/web/src/features/tasks` (verdict list, issues, auto-approve threshold)                             |
| Support Bot (embed widget + final-compose inclusion)                       | D2                     | Dify/lightweight RAG on SPEC + docs; reuses `features/files` pgvector stack                              |
| Automatic domain deploy (Traefik/nginx)                                    | D3                     | `apps/worker/src/deploy/handler.ts`; real URL over `deploy:run`; auditable (A3), idempotent (A1)         |
