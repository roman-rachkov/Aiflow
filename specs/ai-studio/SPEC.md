# AI Studio

## Goal and context

AI Studio is an autonomous development platform that carries a user from an idea stated in plain language to a working web application deployed in an isolated environment, without a developer.

The problem: a person with an idea cannot realise it without a technical specialist, and the specialist spends weeks on routine work that amounts to translating requirements into code. AI Studio closes that gap: an interview with an AI Analyst → a structured `SPEC.md` → decomposition into atomic tasks → code generation in isolated sandboxes → build and deploy.

Who it is for:

- **Customer** ("Aunt Zina") — a non-technical user who wants a finished application and will not open a code editor.
- **Engineer** ("Uncle Vasya") — a technical user who wants the routine accelerated but keeps control over code, models and deployment.

Scope of this specification: iterations **MVP-0** (2 weeks) and **MVP-1** (6 weeks, weeks 3–8). Everything the source documents defer to "after MVP" — a visual agent builder, local models via Ollama, generation stacks other than Next.js, integration with external Git services, HashiCorp Vault, Gitea Actions — is out of scope.

MVP-1 readiness criteria: a customer with no technical knowledge gets a working CRUD application behind a link in ≤ 2 hours; an engineer can edit code by hand and subsequent generation does not overwrite those edits; the platform handles 3 concurrent projects without mixing data; all secrets are encrypted; the platform builds and deploys a simplified prototype of itself (dogfooding).

## Users and roles

The platform has one human user account type. What the earlier documents called "Customer" and "Engineer" are in fact **two UI modes of the same application**, selectable by the user:

- **Basic mode** — the non-technical path. The user describes an idea in chat, uploads documents, approves the specification, starts generation and receives a finished application behind a link. The code editor is not shown. Navigation: "My projects", "Researcher", "Deployments".
- **Professional mode** — everything in basic mode plus: editing `SPEC.md` by hand, configuring providers and models for the AI roles, the code editor and Git, task and roadmap management, embedded agent configuration, triggering builds. Full menu.

Separately from the UI mode, an account carries a **role** used for authorisation:

- **User** — the default. Owns the projects they create.
- **Admin** — reserved for the future admin panel.
- **Owner** — the platform operator.

Only `User` is exercised in MVP-0/MVP-1; `Admin` and `Owner` are carried in the model so the admin panel and hired staff do not require a migration later. Multi-user collaboration on a single project (a project-members model) is deliberately deferred — see open questions.

Platform monitoring (the Bull Board queue panel, e-mail alerts on critical incidents) has no dedicated interface in MVP; it is reached directly.

## Functional requirements

### Screen/Page "Sign in / Sign up"

- **URL**: `/signin`
- **Available to roles**: unauthenticated visitor.
- **Purpose**: sign-in and registration.
- **Interface elements**:
  - [Input] E-mail: address for magic-link sign-in.
  - [Button] Sign in by e-mail: sends the sign-in link.
  - [Button] Sign in with GitHub: OAuth.
- **States**: `loading` — sending the link; `success` — "we sent a sign-in link to your e-mail"; `error` — field-level validation error or a failure toast.
- **Logic**: NextAuth (Email provider with magic link, GitHub OAuth). On first successful sign-in a `User` row is created; then redirect to the Dashboard.
- **Scope**: mvp-0

### Screen/Page "Dashboard"

- **URL**: `/`
- **Available to roles**: all authenticated users (both UI modes).
- **Purpose**: the user's project list and project creation.
- **Interface elements**:
  - [Heading] AI Studio logo; [Avatar] profile menu with "Settings" and "Sign out".
  - [Button] New project: opens a modal with a "Project name" field and a "Create" button.
  - [Card] Project cards: name, latest build status (green deployed, yellow building, red failed, grey never built), last modified date.
  - [Button] Open: navigates to the project card.
  - [Button] Delete: deletion with confirmation in a modal.
- **States**: `loading` — skeleton cards; `empty` — icon plus "You have no projects yet. Create your first project to get started"; `error` — retry.
- **Logic**: creating a project inserts a `ProjectMeta` row, generates a dedicated PostgreSQL schema `project_{uuid}` with all its tables (SQL script rendered from the template), creates a Gitea repository and a MinIO bucket, then redirects to `/projects/[id]/research`. Card status comes from the latest `DeploymentMeta` row.
- **Scope**: mvp-0

### Screen/Page "Project card"

- **URL**: `/projects/[id]`
- **Available to roles**: all authenticated users.
- **Purpose**: project summary and entry point into its sections.
- **Interface elements**:
  - [Heading] Project name and description.
  - [Text] Latest specification version, latest deployment status and URL if any.
  - [List] Sidebar of project sections; membership depends on UI mode (basic — "Researcher", "Deployments"; professional — plus "Tasks", "Editor", "Agents").
- **States**: `loading`; `error` — project not found or no access.
- **Logic**: the source documents do not describe this screen's content. The summary above is a minimum derived from the data model and needs confirmation — see open questions.
- **Scope**: mvp-0

### Screen/Page "Researcher"

- **URL**: `/projects/[id]/research`
- **Available to roles**: all authenticated users. The primary screen in basic mode.
- **Purpose**: the interview with the AI Analyst, plus reviewing and approving the specification.
- **Interface elements**:
  - [List] Left panel (20%) project artifacts: "Specification" with its version number, "Uploaded files" (deletable list), "Roadmap" linking to `/projects/[id]/tasks`.
  - [FileUpload] Upload: adds files and links to the project (professional mode only).
  - [List] Centre (60%) chat with the Analyst: message history (AI/user avatar, text, timestamp).
  - [Input] Message field; [Button] Send.
  - [Button] Create specification: generates `SPEC.md` from the accumulated dialogue.
  - [Text] Right panel (20%): `SPEC.md` preview as rendered Markdown; appears after the first generation.
  - [Button] Approve specification: becomes disabled once pressed and is replaced by "Start generation".
  - [Button] Edit: opens `SPEC.md` in Monaco in Markdown mode (professional mode only).
  - [Button] Start generation: starts planning and navigates to the tasks screen.
- **States**: `loading` — "typing…" indicator while awaiting a reply; `empty` — no messages yet; `error` — "Something went wrong, please try again"; generation shows a progress bar with "The Analyst is preparing the specification…".
- **Logic**: a user message goes to `POST /api/projects/[id]/chat`; the Analyst's reply streams back over SSE and is persisted to the project's dialogue history. Uploaded files land in MinIO with metadata in `UserFile`; their contents are indexed for RAG and relevant fragments are mixed into the Analyst's context. "Create specification" enqueues `spec:generate`; the result is stored as a new immutable `Specification` version and committed to Gitea. "Start generation" is rendered disabled in MVP-0 — the planner pipeline is MVP-1.
- **Scope**: mvp-0

### Screen/Page "Tasks and Roadmap"

- **URL**: `/projects/[id]/tasks`
- **Available to roles**: professional mode. Basic mode reaches it after "Start generation" to watch progress.
- **Purpose**: the work plan and task execution status.
- **Interface elements**:
  - [Button] Start generation: enabled when the plan has not been run yet.
  - [Button] Restart all: with confirmation.
  - [Text] Overall progress: "3 of 10 tasks complete".
  - [List] Timeline (left): vertical task list with dependency lines; per task a title, status (pending, running, in review, done, failed) and a coloured priority label. Drag to reorder.
  - [Text] Detail panel (right): title, full description, acceptance criteria, status, and the execution log (`TaskLog`) as a scrollable block with timestamps.
  - [Button] Restart task: available for failed tasks.
  - [Button] View diff: opens the editor in comparison mode.
  - [Button] Generate plan: shown when no plan exists; enabled once the specification is approved.
- **States**: `loading`; `empty` — no plan generated yet; `error` — planning failed, with the reason.
- **Logic**: "Generate plan" enqueues `plan:generate`; the Planner reads the latest `SPEC.md`, calls the LLM, parses the response and creates `Task` rows. Tasks then flow into `code:execute`. Task statuses and log lines stream to the UI over WebSocket. When every task is closed, `deploy:run` starts automatically.
- **Scope**: mvp-1

### Screen/Page "Code editor"

- **URL**: `/projects/[id]/editor`
- **Available to roles**: professional mode only.
- **Purpose**: manual code editing and Git history.
- **Interface elements**:
  - [List] Left panel: project file tree with type icons; click opens a file; context menu for create file, create folder, delete, rename.
  - [Tabs] Centre: Monaco Editor with syntax highlighting and autocompletion, one tab per open file.
  - [Text] Bottom panel: terminal — see open questions, its backend is undefined.
  - [List] Right panel (toggleable) Git history: commits with message and author (AI or user); diff view for the selected commit.
  - [Button] Save (Ctrl+S): saves the file and commits as the user.
  - [Button] Build: starts a deployment.
- **States**: `loading` — tree and file fetch; `empty` — empty repository; `error` — Gitea unavailable, buffer preserved.
- **Logic**: the tree and file contents are read through the Gitea API; a manually changed file is marked "modified" in the tree. In MVP-1, if an engineer edits a file belonging to an active Coder task, the system warns and offers to block the task or branch the edits.
- **Scope**: mvp-0 (editor, tree, history, diff, commit, Build); the sandbox terminal, task diff mode and manual-edit protection are mvp-1

### Screen/Page "Project agents"

- **URL**: `/projects/[id]/agents`
- **Available to roles**: professional mode only.
- **Purpose**: managing agents embedded into the target application.
- **Interface elements**:
  - [Table] Active agents: name, type, status (active/inactive), creation date.
  - [Button] Add agent: choose from templates — "Support Bot" (RAG over `SPEC.md` and project documentation) and "Custom agent" (unavailable in MVP, shows "Coming soon").
  - [Card] Configuration: agent name; knowledge sources (automatically `SPEC.md` and uploaded files); chat widget preview.
  - [Button] Train: starts document indexing.
- **States**: `empty` — no agents; `loading` — indexing in progress; `error` — indexing failed.
- **Logic**: an agent is stored as an `EmbeddedAgent` row of type `support_bot` with parameters in `config`. After successful indexing the status becomes active and the agent can be embedded into the target application via iframe or a JavaScript snippet; the bot is also included in the application's final build.
- **Scope**: mvp-1

### Screen/Page "Deployments"

- **URL**: `/projects/[id]/deployments`
- **Available to roles**: all authenticated users.
- **Purpose**: deployment status and logs, and the link to the finished application.
- **Interface elements**:
  - [Table] Deployments: date, status icon, version (image tag), application URL when deployed.
  - [Modal] Row click: opens the full build log.
  - [Button] Deploy now: starts a new build from the current repository state.
- **States**: `empty` — never built; `loading` — build in flight, with progress; `error` — build failed, log retained.
- **Logic**: MVP-0 offers Dockerfile and `docker-compose.yml` generation from a template plus an image build through the Docker Engine API. In MVP-1 the job goes to `deploy:run`, which builds the application together with its agents and deploys it to a test domain, returning a URL. Progress and logs are written to `Deployment`; the summary to `DeploymentMeta`.
- **Scope**: mvp-0 (manual build); automatic deploy is mvp-1

### Screen/Page "Profile settings"

- **URL**: `/settings/profile`
- **Available to roles**: all authenticated users.
- **Purpose**: account settings.
- **Interface elements**:
  - [Input] Name: display name.
  - [Text] E-mail: account address, read-only.
  - [Toggle] Interface mode: basic / professional.
- **States**: `loading`; `success` — saved toast; `error` — validation error.
- **Logic**: the source documents do not describe this screen; the fields above derive from the `User` model. The mode toggle is what switches the navigation described under Users and roles.
- **Scope**: mvp-0

### Screen/Page "Model settings"

- **URL**: `/projects/[id]/settings/models`
- **Available to roles**: professional mode only.
- **Purpose**: choosing the provider and model for the project's AI roles, and entering API keys.
- **Interface elements**:
  - [Select] Provider: routerai.ru, OpenAI, Anthropic.
  - [Select] Model: models available for the chosen provider.
  - [Input] API key: masked.
  - [List] Fallback order: sortable provider sequence used when the primary is unavailable.
  - [Button] Save: writes the configuration encrypted.
- **States**: `loading`; `success` — saved toast; `error` — unknown provider or failed save.
- **Logic**: stored in the project's `ModelConfig.config`. MVP-0 configures the Analyst role; MVP-1 adds Coder and Reviewer. Keys are AES-256-GCM encrypted before the write and decrypted only for the provider call. Basic mode runs on platform defaults and never sees this screen. The URL above is a proposal — the source documents assign none.
- **Scope**: mvp-0 (Analyst); other roles mvp-1

## Background processes

### Job "spec:generate"

- **Trigger**: the "Create specification" button on the Researcher screen.
- **Steps**: load the project's chat history and RAG chunks → call the Analyst through model-router → compute the next version as `max(version) + 1` → insert an immutable `Specification` row → commit the content to `SPEC.md` in the Gitea repository under the platform identity → enqueue reindexing of the new specification.
- **Failure handling**: no partial version is left behind; the error is retained in the job log and surfaced in the UI.
- **Scope**: mvp-0

### Job "index:document"

- **Trigger**: a file upload, or a newly generated specification.
- **Steps**: fetch the object from MinIO → extract text by MIME type → chunk it → request embeddings through model-router → insert `DocumentChunk` rows into the project schema.
- **Failure handling**: idempotent per source — existing chunks for that source are deleted before insert, so a retry cannot duplicate.
- **Scope**: mvp-0

### Job "plan:generate"

- **Trigger**: the "Generate plan" button, enabled once the specification is approved.
- **Steps**: read the latest `SPEC.md` → call the Planner → parse the JSON task array → create `Task` rows with their dependency edges → enqueue the ready tasks into `code:execute`.
- **Failure handling**: a malformed or contradictory response leaves no partial plan; the Planner may return a structured error instead of a plan, which is shown to the user.
- **Scope**: mvp-1

### Job "code:execute"

- **Trigger**: a task whose dependencies are satisfied.
- **Steps**: clone the current code from Gitea into a volume → start an ephemeral sandbox → run Aider headless → run TypeScript, ESLint, Prettier and `prisma validate` → on success commit to the task branch; on failure hand the logs to the Reviewer.
- **Failure handling**: the sandbox is destroyed after every task. Task progress is checkpointed to `TaskLog` in PostgreSQL, so losing Redis means the worker resumes from the log rather than losing work.
- **Scope**: mvp-1

### Job "deploy:run"

- **Trigger**: all tasks in the plan closed, or the "Deploy now" button.
- **Steps**: build the application image together with its agents → deploy to a test domain → write the URL and logs back to the project UI.
- **Failure handling**: status and full build log are retained in `Deployment`; the terminal state is mirrored to `DeploymentMeta`.
- **Scope**: mvp-0 for the manual build path, mvp-1 for automatic deployment

## Data entities

Schema `public` (shared data):

- **User**: id, email (unique), name, avatarUrl, role (`OWNER` | `ADMIN` | `USER`, default `USER`), uiMode (`BASIC` | `PRO`, default `BASIC`), createdAt, updatedAt; one-to-many with ProjectMeta.
- **ProjectMeta**: id, name, description, schemaName (unique, e.g. `project_abc123`), ownerId, createdAt, updatedAt, status (`ACTIVE` | `ARCHIVED` | `DELETED`).
- **DeploymentMeta**: id, projectId, status (`BUILDING` | `DEPLOYED` | `FAILED`), url, createdAt.
- NextAuth adapter models (Account, Session, VerificationToken).

Schema `project_{uuid}` (per-project data):

- **ModelConfig**: id, projectId (unique), config (JSON of providers and models per role; API keys encrypted).
- **Specification**: id, version, content (Markdown), createdAt, createdBy (`USER` | `AI`), approvedAt, approvedBy. Rows are immutable; the version increments.
- **Task**: id, title, description (the full prompt for the Coder), status (`PENDING` | `IN_PROGRESS` | `AWAITING_REVIEW` | `DONE` | `FAILED` | `CANCELLED`), priority (`CRITICAL` | `HIGH` | `MEDIUM` | `LOW`), acceptance, branchName, headCommit, mergedAt, createdAt, updatedAt, completedAt; many-to-many self-relation for dependencies.
- **TaskLog**: id, taskId, message, level (`INFO` | `WARN` | `ERROR`), createdAt.
- **ChatMessage**: id, role (`USER` | `ASSISTANT`), content, tokensIn, tokensOut, createdAt.
- **DocumentChunk**: id, sourceType (`USER_FILE` | `SPECIFICATION`), sourceId, chunkIndex, content, embedding (pgvector), createdAt.
- **EmbeddedAgent**: id, name, type (`SUPPORT_BOT` | `CUSTOM`), config (JSON), status, createdAt, updatedAt.
- **Deployment**: id, projectId, status, log, url, imageTag, createdAt, completedAt.
- **UserFile**: id, fileName, fileSize, mimeType, storageKey (path in MinIO), createdAt.

Indexes for MVP: unique `User(email)`, `ProjectMeta(ownerId)`, `Task(status)`, `Specification(version)`, `DocumentChunk(embedding)` vector index.

Migrations: the `public` schema uses standard Prisma migrations; project schemas are created by a SQL script rendered from `schema_project_template.prisma` at project creation. Updating existing project schemas is a separate script.

## APIs and integrations

Platform API surface:

- `POST` / `GET` `/api/projects`, `DELETE /api/projects/[id]` — create, list, delete projects.
- `POST /api/projects/[id]/chat` — message the Analyst; the reply streams over SSE.
- `POST` / `GET` / `DELETE` `/api/projects/[id]/files` — upload to MinIO and trigger indexing.
- `POST /api/projects/[id]/specifications/generate` — enqueue specification generation.
- `POST /api/projects/[id]/specifications/[version]/approve` — approve the latest version.
- `GET /api/projects/[id]/files/tree`, `.../content`, `.../commits` — Gitea-backed reads.
- `POST /api/projects/[id]/files/commit` — commit as the acting user.
- `GET` / `PUT` `/api/projects/[id]/model-config` — model configuration, keys masked on read.
- `POST /api/projects/[id]/deploy` — start a build.
- `GET /api/health` — health with dependency detail.
- WebSocket channel: task statuses, `TaskLog` lines, sandbox logs.

External and infrastructure integrations:

- **ModelRouter** (own Express service, port 3001) — one OpenAI-compatible interface over routerai.ru, OpenAI and Anthropic (Ollama after MVP). Supports a fallback chain ordered by the project configuration and a 1-hour Redis cache of identical requests. It stores no keys: they arrive encrypted, are decrypted for the call, then wiped from memory.
- **Gitea API** — one repository per project: file tree, contents, commits, history, diffs. The specification is versioned alongside the code. AI commits are signed with the platform GPG key; manual commits optionally with the user's.
- **MinIO** (S3-compatible) — user files, one bucket per project.
- **Docker Engine API via dockerode** — sandbox startup and application image builds.
- **registry-proxy** — the sandbox's only network egress; permits only allowlisted hosts.
- **RAG indexing** — LlamaIndex (or equivalent) with pgvector over uploaded documents and `SPEC.md`.
- **NextAuth** — Email (magic link) and GitHub OAuth.
- **Bull Board** — queue monitoring.

## AI agents and automation

- **Agent "Analyst"**: runs the interview and generates `SPEC.md`. Knowledge sources: the project dialogue history and relevant fragments of uploaded documents (RAG). Behaviour: one question at a time; when a document contradicts the user's answer it says so and asks for clarification; on the "Create specification" command it emits `SPEC.md` against the fixed template and asks for approval. Queue: `spec:generate`. Scope: mvp-0.
- **Agent "Planner"**: turns the approved `SPEC.md` into atomic tasks with priorities, dependencies and acceptance criteria in a form the Coder understands. Queue: `plan:generate`. Scope: mvp-1.
- **Agent "Coder"**: executes one atomic task as a pinned version of Aider running headless inside an ephemeral Docker container. A Node.js runner inside the container accepts the task as JSON, runs Aider, watches the output and returns the result. Generation is followed by ESLint, Prettier, TypeScript and `prisma validate`. Success commits to the task branch; failure retains the logs, marks the task `FAILED` and hands it to the Reviewer. A dry-run mode shows the expected diff instead of executing. Queue: `code:execute`. Scope: mvp-1.
- **Agent "Reviewer"**: receives the diff, the acceptance criteria and the tool reports, and issues a verdict — either returning the task to the queue with a clarification or closing it as `FAILED` for manual intervention. Scope: mvp-1.
- **Test generation agent**: writes unit tests for a change as a separate task after the Coder. Scope: mvp-1.
- **Agent "Deployer"**: builds the application image together with its agents and deploys it to a test domain, returning the URL and logs. Queue: `deploy:run`. Scope: mvp-1.
- **Embedded agent "Support Bot"**: a support-agent template for the target application. Knowledge sources: the project's `SPEC.md` and uploaded documents. Embedded via iframe or a JavaScript snippet and included in the application's final build. The MVP template library holds this one agent; "custom agent" is marked coming soon. Scope: mvp-1.

Automation without user involvement:

- Task progress is checkpointed to `TaskLog` in PostgreSQL, so a worker can resume from the log after Redis loss.
- Every service exposes `/health`; Docker Compose restarts failed containers.
- A failed task surfaces in the UI; critical incidents (for example, the database being unreachable) e-mail the operator.
- If Gitea is unavailable the Coder keeps working against the sandbox's local copy, and the last commit is cached in PostgreSQL and synchronised on recovery.

## Non-functional requirements

- **Platform**: responsive web application. Below 768 px the side panels collapse into a hamburger menu and the chat and editor take the full width.
- **Stack**: React 18 and Next.js (App Router) with Tailwind and Monaco Editor on the frontend; Next.js Route Handlers and WebSocket on the backend; NextAuth; PostgreSQL 16 with Prisma; BullMQ on Redis 7; MinIO; Gitea; dockerode; a pinned Aider as the Coder; an in-house ModelRouter on Express; Bull Board. The repository is a monorepo on Yarn workspaces with Lerna.
- **Design**: minimalist, light theme by default, accent blue `#2563EB`, Inter. Toasts top-right: success green, error red, warning yellow. Long operations show progress in the header or via a toast.
- **Deployment**: Docker Compose, one container per component. Target applications deploy to the platform's test domain; the alternative is exporting `docker-compose.yml`.
- **Constraints**:
  - The Next.js application performs no long-running work — it enqueues. Anything long belongs in a worker.
  - Four queues, one worker container each, `concurrency = 1`.
  - Data isolation: one PostgreSQL schema per project; the Prisma connection is derived by substituting the schema name into the connection URL. Clients are cached and evicted when a project is archived or deleted. Only users and project/deployment metadata live in `public`.
  - Network isolation: sandboxes sit on an internal network with no route to PostgreSQL, Redis or Gitea; the only egress is registry-proxy with an allowlist.
  - Sandbox limits: read-only root filesystem except tmpfs for `/tmp`, caches and `node_modules`; `--cap-drop=ALL`, `--security-opt=no-new-privileges`, never `--privileged`; 1 CPU and 512 MB; destroyed after every task.
  - Secrets: API keys are AES-256-GCM encrypted under a 32-byte master key held in an environment variable; the decrypted value is never persisted.
  - MVP scale: up to 5 concurrent projects, with 3 confirmed by tests.
  - The generated stack is Next.js + Prisma + PostgreSQL only.
  - No CI/CD in MVP: tests and builds run manually via scripts.
  - Host ports: 3000 application, 3001 ModelRouter, 3002 Gitea, 5432 PostgreSQL, 6379 Redis, 9000/9001 MinIO.

## Assumptions and open questions

Resolved while writing this specification (recorded so they are not re-litigated):

1. **User roles.** "Customer" and "Engineer" are UI modes (`uiMode`), not roles. A separate `role` field (`OWNER` | `ADMIN` | `USER`) is carried for the future admin panel. Multi-user collaboration on one project is deferred.
2. **`Task` dependencies.** Modelled as an explicit many-to-many self-relation; `priority` becomes an enum, since the Planner emits strings.
3. **Specification approval.** Recorded on the `Specification` row (`approvedAt`, `approvedBy`) so history stays auditable.
4. **`ChatMessage`.** Fields fixed as id, role, content, tokensIn, tokensOut, createdAt.
5. **Vector index placement.** `DocumentChunk` lives in the project schema, preserving the data-isolation invariant.
6. **Sandbox concurrency.** One worker container per queue at `concurrency = 1`. Branch-per-task removes the shared-ref hazard that motivated per-project serialisation; parallelism across projects is a later change, gated on the Planner marking only disjoint file sets as parallel-eligible.
7. **Sandbox network name.** `sandbox`, declared `internal: true`.

Still open (each needs a decision before the component that depends on it is built):

8. **Support Bot technology.** Dify or a lightweight RAG equivalent, and whether delivery is an iframe widget or a service in the target application's compose file. Two different delivery models; not chosen.
9. **Editor terminal.** Sandboxes are ephemeral and network-isolated, so there is no durable target for an interactive terminal outside task execution.
10. **Model settings coverage.** Which AI roles are configurable: Analyst, Coder and Reviewer, or also the Planner. Whether the Deployer calls an LLM at all.
11. **Auto-deploy versus dry-run.** Whether dry-run is the default and where the user confirms.
12. **Manual-edit protection.** Branch-per-task answers the mechanism in principle, but the conflict-resolution flow in the UI is unspecified.
13. **Deploy target.** Traefik or an nginx proxy; the naming scheme on the test domain; whether TLS is needed in MVP.
14. **Test runner.** Not named by any document, while the acceptance loop and the Coder both depend on it.
15. **Project deletion.** Soft delete versus dropping the schema, the Gitea repository and the MinIO bucket.
16. **`Deployment` / `DeploymentMeta` synchronisation.** The rule between the per-project row and the public summary is undocumented.
17. **SMTP configuration.** Magic-link sign-in needs a mail provider that no document specifies.
18. **MVP-1 timeline.** Six weeks for one engineer, against an assessment that comparable scope usually takes 3–4 months.
