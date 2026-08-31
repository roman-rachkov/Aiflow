# AI Studio – Architecture and design description (MVP)

## 1. Top-level structure

The system consists of four isolated component groups:

1. **Client layer** – web interface on React, Tailwind, Monaco Editor.
2. **Application server** – Next.js (API Routes, authentication, WebSocket proxy).
3. **Background workers** – separate Node.js processes handling long-running tasks via BullMQ.
4. **Infrastructure services** – PostgreSQL, Redis, MinIO, Gitea, the Docker sandbox runner.

All components are deployed via Docker Compose, each in its own container, with restricted network access.

## 2. Component details

### 2.1. Web server (Next.js)

- **Functions**: serving the frontend, REST API, WebSocket terminal (proxied into the sandbox), authentication via NextAuth.
- **Responsibility boundary**: does not run long tasks, only enqueues them.
  Chat LLM loops run on the `chat-run` worker (D0g); the app proxies Redis
  pub/sub as SSE — see `docs/14-decisions-needed.md` § D0g.
- **Scaling**: runs in a single container; scales horizontally when needed thanks to its stateless architecture (state lives in PostgreSQL and Redis).

### 2.2. Background workers (BullMQ Workers)

Run as **separate Node.js containers** that share no memory with the Next.js server. This prevents heavy tasks from blocking the main event loop.

Queues (hyphen names — BullMQ forbids `:` in queue names; see
`docs/roadmap/DOC_RESOLUTIONS.md` RES-QUEUE):

- `spec-generate` – **dormant** (stub-ack); SPEC generation runs inside the
  `chat-run` tool executor, not this queue.
- `plan-generate` – decomposition of SPEC.md into tasks by the Planner.
- `code-execute` – execution of atomic tasks by the Coder in a sandbox.
- `code-review` – LLM Reviewer one-shot verdict (shipped; product gate still
  sandbox checks until MVP-2 — OQ #7).
- `deploy-run` – Docker image build and deploy of the user application.
- `chat-run` – multi-turn Analyst chat with tool calling on the worker.

Each worker container subscribes to the queues listed in compose `QUEUES` and
scales independently under load.

**Fault tolerance**: task progress is checkpointed periodically to `TaskLog` (PostgreSQL). If Redis crashes and the queue is lost, the worker recovers unfinished tasks from the logs.

### 2.3. Data storage

#### PostgreSQL

- The platform's main database.
- **Project isolation**: each project gets its own schema (`project_{id}`). Prisma connects dynamically to the right schema via a `connectionString` with a `schema` parameter. This rules out accidental data mixing between projects at the database level.
- The public schema (`public`) holds only user accounts and project metadata.

#### Redis

- Used solely as the BullMQ message broker and as a cache (LLM responses, sessions).
- Its data is not critical for recovery (everything important is mirrored in PostgreSQL).

#### MinIO

- S3-compatible object storage for user files (uploaded documents, assets).
- File access is strictly partitioned by bucket (one bucket per project).

#### Gitea

- Self-hosted Git server, one repository per project.
- Generated user repos hold `specs/SPEC.md` (B1 in `14-decisions-needed.md`).
  The platform reads specifications from the `Specification` table; Gitea
  receives a copy on each version commit for audit alongside code.
- AI agent commits are signed with a dedicated platform GPG key; manual commits use the user's key (optional).
- If Gitea goes down, Coder workers cache the last commit in PostgreSQL and keep working from the local copy (in the sandbox container), syncing changes after recovery.

### 2.4. Code generation sandbox

An isolated environment where Coder tasks run. Implemented as a temporary Docker container with the following restrictions:

- **Filesystem**: mounted `--read-only`, except for:
  - `tmpfs` for `/tmp`, `/home/user/.cache`, `node_modules` (recreated for every task).
  - The project source volume (mounted from a named Docker volume pre-cloned from Gitea).
- **Network**: attached to a separate bridge network isolated from internal services. Internet access is denied, except for:
  - The `registry-proxy` container, which passes requests only to npmjs.org, pypi.org and GitHub (for dependency installation). The proxy filters URLs against an allowlist.
- **Privileges**: the container runs without `--privileged`, with `--cap-drop=ALL`, `--security-opt=no-new-privileges`.
- **Resources**: hard CPU and memory limits (`--cpus=1`, `--memory=512m`).

Inside the container:

- **Aider** (pinned version) in headless mode.
- **A runner script** (Node.js) that accepts the task, starts Aider, monitors output and returns the result.
- **Acceptance tooling**: TypeScript, ESLint, Prettier, `prisma validate` — all four run after code generation, and **all four are fatal**. A failure marks the task failed and hands it to the Reviewer; it never commits. See [11-sandbox.md](11-sandbox.md) for the runner. (Until 2026-08-02 the runner treated an ESLint failure as a warning and never called Prettier or `prisma validate` at all, which made this sentence aspirational — fixed as part of scaffolding.)

Once the task finishes (success or failure) the container is destroyed, and changes are either committed to Gitea (on success) or discarded.

### 2.5. AI router (ModelRouter)

An in-house adapter microservice exposing one interface for LLM calls. It supports:

- **Providers**: routerai.ru, OpenAI, Anthropic, Ollama (planned). All are reached through an OpenAI-compatible API (with adapters where needed).
- **Fallback chain**: if the primary provider is unavailable, the next one is tried automatically (from the project configuration). The user can set the order.
- **Caching**: identical requests (within one context) are cached in Redis for 1 hour.
- **Configuration**: each role (Analyst, Planner, Coder, Reviewer) can have its own set of models and providers, configured by the Engineer in project settings. The Customer uses defaults.
- **Escalation (MVP-3 C3):** optional advisor model per role — post-MVP; the
  router must allow a second routed request without redesign. See
  `docs/roadmap/DOC_RESOLUTIONS.md` RES-009 and OQ #9.

The router stores no keys: they arrive encrypted, are decrypted inside the service for the duration of the call, and are wiped from memory immediately after.

### 2.6. Secret security

- The master encryption key lives in an **environment variable** of the Next.js and worker containers. In production it must move to HashiCorp Vault, but for MVP a `.env` with restricted permissions is acceptable.
- User API keys are encrypted with AES-256-GCM before being written to the database. Decryption flow:
  1. The worker (or API route) fetches the encrypted key from the database.
  2. Decrypts it with the master key.
  3. Passes it to ModelRouter (over a secured internal channel).
  4. After the LLM call, the decrypted value is wiped.
- Later, users will be able to attach their own Vault instances, or avoid storing keys at all by pointing at their own proxy URL (for example, a local Ollama).

## 3. Network interactions and isolation

All services share the `ai-studio-internal` Docker network. Additionally:

- `sandbox-net` – an isolated network for sandboxes, with no access to `ai-studio-internal`.
- `registry-proxy-net` – connects sandboxes to the proxy container, which has limited outbound internet access.

This topology makes it impossible for user code to reach the platform's database, Redis or Gitea over the network.

## 4. Code generation request lifecycle

1. The user approves SPEC.md and starts planning (UI or chat tool).
2. The API enqueues `plan-generate`.
3. The Planner creates atomic `Task` records with dependencies.
4. The user starts the plan; the worker enqueues unblocked tasks on
   `code-execute`.
5. The Coder worker starts a sandbox: clones from Gitea, checks out
   `task/{id}-{slug}`, runs Aider, then fatal sandbox checks.
6. On sandbox success the runner commits; the worker pushes the branch and
   may enqueue `code-review` (LLM verdict — optional product path, MVP-2).
7. **Slim MVP-1 product gate:** sandbox green + push → task progresses; check
   failure → `FAILED`. No mandatory LLM Reviewer (OQ #7).
8. When tasks complete, the user triggers `deploy-run` (manual in slim MVP-1;
   automatic domain deploy → MVP-2 §4.3).

## 5. Error handling and monitoring

- **Health checks**: every service exposes a `/health` endpoint. Docker Compose restarts crashed containers automatically.
- **Logging**: all components write structured logs to stdout, collected by Docker and forwardable to ELK/Loki.
- **Queue monitoring**: BullMQ ships the Bull Board panel, available to the administrator.
- **Notifications**: on task failure the user sees the error in the UI; critical incidents (database down) alert the administrator (MVP: email).

## 6. MVP scalability

- The platform targets **up to 5 concurrent projects**.
- Worker limits: `concurrency = 1` per queue (one worker container = one task at a time). Worker replicas are added as load grows.
- Sandboxes run sequentially, one task at a time, across the whole platform — a direct consequence of `concurrency = 1`.

  An earlier revision claimed sandboxes run "sequentially within a project but in parallel across projects", which `concurrency = 1` makes impossible. The serialisation was justified by Git conflicts; branch-per-task ([15-engineering-conventions.md](15-engineering-conventions.md) § 1.4) removes that premise, since parallel tasks no longer share a working ref. Parallelism is therefore available when needed — raise concurrency and have the Planner mark only disjoint file sets as parallel-eligible — but is not enabled for MVP, which targets 5 concurrent projects. Resolved as question #3 in [12-open-questions.md](12-open-questions.md).

## 7. Technology stack (final list)

| Component        | Technology                          |
| ---------------- | ----------------------------------- |
| Frontend         | React 18, Next.js, Tailwind, Monaco |
| Backend          | Next.js API Routes, WebSocket       |
| Authentication   | NextAuth Credentials (MVP); Email/OAuth deferred |
| Database         | PostgreSQL 16 + Prisma              |
| Queues           | BullMQ + Redis 7                    |
| File storage     | MinIO                               |
| Git              | Gitea                               |
| Sandboxes        | Docker Engine API (dockerode)       |
| Coder            | Aider (pinned version)              |
| AI routing       | In-house ModelRouter (Express)      |
| Queue monitoring | Bull Board                          |
| Deployment       | Docker Compose                      |
