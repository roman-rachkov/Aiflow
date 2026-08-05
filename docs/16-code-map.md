# AI Studio — Code Map

One line per package / slice: what it owns, its public entry point, its
dependencies. The file that lets a session act without re-deriving the
structure by search. Layout per A4 in
[14-decisions-needed.md](14-decisions-needed.md).

```
apps/
├── web/                  Next.js (App Router, TS strict, Tailwind v4)
│                         └── public entry: src/app, src/features/*
│                             deps: @aiflow/{db,queue,crypto,ai-roles,ui}
│                             layout: app/ (routing only) → features/ →
│                                     shared/ → packages/ (§ 2.2)
│   features:
│     ├── auth/           NextAuth v5, guards, session (Task 1.2a)
│     ├── projects/       Projects CRUD + schema provisioning (Task 1.2b)
│     │                     └── public entry: src/index.ts
│     │                         model/service.ts — create/list/get/remove over
│     │                           ProjectMeta; create is a compensation saga
│     │                           (createProjectSchema → projectMeta.create →
│     │                           dropProjectSchema on failure)
│     │                         ui/ — ProjectList, ProjectCard, ProjectDetails,
│     │                           CreateProjectForm + DeleteProjectButton (the
│     │                           delete confirm overlay lives here, not in
│     │                           @aiflow/ui — one consumer, per D0 / § 2.3)
│     └── chat/           Analyst chat — SSE streaming + history (Task 1.3)
│                           └── public entry: src/index.ts
│                               model/service.ts — listMessages/saveMessage over
│                                 ChatMessage (project-scoped); model/schema.ts —
│                                 readSystemPrompt() reads .claude/agents/analyst.md
│                                 per turn (module-relative path, not cwd)
│                               ui/ChatPanel.tsx — @assistant-ui/react runtime +
│                                 primitives; ui/researcher-runtime.ts —
│                                 ChatModelAdapter (POST → SSE → cumulative yield);
│                                 ui/parse-sse-response.ts — client SSE framing
│   routes (app/):
│     /  → redirect('/projects');  /projects, /projects/new, /projects/[id]
│     /projects/[id]/research — two-panel Researcher page (Task 1.3)
│     /api/projects (GET list, POST create), /api/projects/[id] (GET, DELETE)
│     /api/projects/[id]/chat (POST — SSE-streamed Analyst reply, Task 1.3)
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
├── ai-roles/             Model provider adapter (Task 1.3). Leaf package.
│                         └── public entry: src/index.ts
│                             types.ts — ChatRole, ChatMessage, ChatConfig,
│                               ChatResult (nullable token counts), ModelProvider
│                               (chat()), StreamingProvider (+ chatWithUsage())
│                             zai-provider.ts — ZaiProvider: mock path (canned
│                               replies, no key) + live dispatch; createZaiProvider()
│                             zai-live.ts — streamLiveChat(): POST to
│                               api.z.ai/api/paas/v4/chat/completions (OpenAI-
│                               compatible), role mapping, usage capture
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

| Concern                                                            | Where                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| Auth helpers (`requireUser`, `requireProMode`, `canAccessProject`) | `apps/web/src/features/auth` (Task 1.2a)             |
| Projects CRUD + schema provisioning                                | `apps/web/src/features/projects` (Task 1.2b)         |
| Analyst chat (SSE streaming + history)                             | `apps/web/src/features/chat` (Task 1.3)              |
| Model provider adapter (z.ai GLM, mock/live)                       | `packages/ai-roles/src` (Task 1.3)                   |
| App shell (header, side menu)                                      | `apps/web/src/shared/ui` (Task 1.2a)                 |
| UI primitives + design tokens                                      | `packages/ui/src` (Task 1.2d)                        |
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
- `packages/crypto` is declared but empty until its consumers arrive;
  `packages/ai-roles`, `packages/db`, and `packages/ui` are real (ai-roles
  shipped in Task 1.3).
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
