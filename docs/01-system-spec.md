# AI Studio – System Specification (MVP)

## 1. Purpose

AI Studio is an AI-driven autonomous software development environment. It takes a user from a natural-language idea to a working application deployed in an isolated environment, without requiring technical specialists.

## 2. Target audience and key roles

### 2.1. Customer (non-technical user)

- Describes the idea, uploads documents.
- Approves the specification and the plan.
- Receives the finished application.
- Does not interact with the code editor.

### 2.2. Engineer (technical user)

- Can do everything the Customer can.
- Configures AI models, supervises generation.
- Edits code manually when needed.
- Works with the Git repository.

### 2.3. Internal roles (AI agents)

- **Analyst** – runs the interview, generates a structured specification (SPEC.md).
- **Planner** – turns the specification into a queue of atomic tasks with dependencies.
- **Coder** – executes tasks, modifying code in a sandbox.
- **Reviewer** – checks the result against acceptance criteria and automated tests.
- **Deployer** – builds a Docker image and deploys the application.

## 3. Functional blocks

### F1. Researcher

- Chat interview with the Analyst.
- Upload of files, links, notes (RAG indexing).
- Iterative SPEC.md generation.
- Specification versioning.

### F2. Planning

- Automatic decomposition of SPEC.md into tasks.
- Roadmap built from dependencies.
- Plan presented to the user for approval.

### F3. Automatic code generation

- Isolated task execution by the Coder.
- Next.js stack support (React, Prisma, PostgreSQL, Tailwind).
- Git integration (Gitea), commits by AI.
- Change preview (dry-run) with confirmation.

### F4. Manual refinement

- Monaco Editor with a file tree.
- Git panel: diffs, commit history, branches.
- Protection of manual edits against overwrite by generation (manual/auto branches).

### F5. Acceptance loop

- **Slim MVP-1 gate:** TypeScript, ESLint (`--max-warnings 0`), Prettier, and
  `prisma validate` inside the sandbox runner — all fatal before commit.
- **MVP-2+:** automatic unit test generation and an LLM Reviewer over diff +
  acceptance criteria (`code-review` queue). Self-Refine retry loop → MVP-3.

### F6. Embeddable agents (MVP-2)

- Library of ready-made agents (minimum: Support Bot with project RAG).
- Can be attached to the application under construction.
- Deferred out of slim MVP-1 — see `docs/04-roadmap.md` §4 task 4.2.

### F7. Build and deploy

- Docker image build of the target application (`deploy-run` queue).
- **MVP-0 / slim MVP-1:** manual build path and docker-compose export.
- **MVP-2:** deployment to a test domain (Traefik/nginx).
- Health monitoring of the deployed application.

## 4. Architecture and technology

### 4.1. Top-level components

- **API monolith** (Next.js): frontend, REST/WebSocket, authentication (NextAuth).
- **Background workers** (separate Node.js processes with BullMQ): long-running tasks (code generation, deploy, indexing).
- **Storage**: PostgreSQL (core data), Redis (queues, cache), MinIO (files), Gitea (Git repositories).
- **Sandbox**: Docker containers with Aider, managed via dockerode.

### 4.2. Data model (key entities)

- `User`, `Project`, `Specification` (versioned), `Task`, `TaskLog`, `ModelConfig`, `Deployment`.

### 4.3. Security and isolation

- **Tenant isolation**: a separate PostgreSQL schema per project; dynamic Prisma connection.
- **Sandboxes**: containers run `--read-only`, with ephemeral `tmpfs`, on separate bridge networks with no access to internal services. Package registries are reachable only through a dedicated filtering proxy.
- **Secrets**: API keys encrypted with AES-256-GCM, master key in HashiCorp Vault (MVP: environment variables with restricted access). Decryption happens at provider call time and is not persisted.
- **Git**: each project has its own Gitea repository; AI commits are signed with a dedicated key.

### 4.4. Fault tolerance and reliability

- BullMQ workers run as separate processes; a crash of the main Next.js server does not interrupt task execution.
- Task state is mirrored in PostgreSQL (the TaskLog journal); if Redis is lost, tasks restart from the last checkpoint.
- Gitea has a health check and automatic restart; every commit is cached in PostgreSQL.
- LLM fallback providers are supported (if routerai.ru is unavailable, OpenAI/Anthropic are used when keys exist).

### 4.5. AI model routing

- A `ModelRouter` abstraction layer supporting OpenAI-compatible APIs.
- Per-project configuration: a provider and model can be set for each role (Analyst, Coder, Reviewer).
- Response caching for repeated requests (in Redis).

## 5. Development plan (two iterations)

### MVP-0 (2 weeks) – Researcher and manual coding

- Next.js application, authentication, project management.
- Chat with the AI Analyst, SPEC.md generation, file upload (RAG).
- Monaco Editor, file tree, Git integration (browsing, manual commits).
- Manual deploy (Dockerfile/docker-compose export).

### MVP-1 (slim) – Planner + sandbox Coder

- Planner and Aider-based Coder in isolated sandboxes (simple CRUD scope).
- Product gate = sandbox automated checks (not an LLM Reviewer).
- Reuse MVP-0 manual deploy for the generated image.
- Narrow dogfood: one simple CRUD app through plan → codegen.

### MVP-2 – Product features deferred from slim MVP-1

- LLM Reviewer + generated tests; Support Bot; automatic domain deploy.
- Full self-dogfood and load testing. See `docs/04-roadmap.md` §4.

### MVP-3 – Agent maturity

- Durable execution, observability (Langfuse), Self-Refine Reviewer, model
  escalation (C3). See `docs/04-roadmap.md` §5.

## 6. Trade-offs and deliberate limitations

- The only supported generation stack is Next.js + Prisma + PostgreSQL; other languages/frameworks come after MVP.
- The visual agent builder is replaced by a library of ready templates configurable via chat.
- Integration with external Git services is limited to archive export/import.
- Local models (Ollama) come after MVP, via a CLI agent.
- Scaling to many concurrent projects: MVP targets at most 5 projects at a time; queue monitoring is configured at the application level.

## 7. Slim MVP-1 readiness criteria

Aligned with `docs/04-roadmap.md` §6:

1. A Customer gets a simple CRUD web app from an approved SPEC via Planner →
   sandbox Coder; deploy may use the MVP-0 Build path.
2. An Engineer can edit manually without generation overwriting protected files.
3. Sandbox check failure → FAILED; success → commit. No product LLM Reviewer gate.
4. Secrets encrypted; sandbox API key file-mounted; isolation holds for concurrent projects exercised in MVP-0/1.
5. Narrow dogfood (one CRUD app). Full self-dogfood and load testing → MVP-2.
