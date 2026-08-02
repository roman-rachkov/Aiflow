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
- Automatic unit test generation.
- Linters and static analysis.
- LLM-based Reviewer, augmented by tool reports.

### F6. Embeddable agents
- Library of ready-made agents (minimum: Support Bot with project RAG).
- Can be attached to the application under construction.

### F7. Build and deploy
- Docker image build of the target application.
- Deployment to the platform test domain, or docker-compose export.
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

### MVP-1 (next 6 weeks) – Automatic Coder and agents
- Planner and Aider-based Coder, isolated sandboxes.
- Acceptance loop (tests, linters, Reviewer).
- Embeddable Support Bot.
- Automatic deploy to a test environment.
- Dogfooding: create the "AI Studio" project inside the platform itself and run the full cycle for a simple CRUD application.

## 6. Trade-offs and deliberate limitations
- The only supported generation stack is Next.js + Prisma + PostgreSQL; other languages/frameworks come after MVP.
- The visual agent builder is replaced by a library of ready templates configurable via chat.
- Integration with external Git services is limited to archive export/import.
- Local models (Ollama) come after MVP, via a CLI agent.
- Scaling to many concurrent projects: MVP targets at most 5 projects at a time; queue monitoring is configured at the application level.

## 7. MVP-1 readiness criteria
- A Customer ("Aunt Zina") gets a working web application (simple CRUD) within 2 hours, with no Engineer involved.
- An Engineer can fix code manually and redeploy without breaking the automated processes.
- The system handles 3 concurrent projects without data mixing or critical failures.
- All secrets are stored encrypted; project access is strictly isolated.
- The platform successfully builds and deploys a simplified prototype of itself (dogfooding).
