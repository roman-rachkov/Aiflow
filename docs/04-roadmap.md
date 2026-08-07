# AI Studio – MVP development plan (two iterations)

## 1. General provisions

Development is done by a single engineer using AI assistants (dogfooding as the platform becomes usable). The plan splits into two sequential iterations, each ending in a measurable, demonstrable result.

**Key principle:** first deliver user value (the path from idea to specification, plus manual deploy), then automate code generation.

---

## 2. Iteration MVP-0 (2 weeks) – Researcher and manual coding

**Goal:** a platform where the Customer (Aunt Zina) can describe an idea and get a structured specification, and the Engineer (Uncle Vasya) can write or import code manually and deploy the application.

### 2.1. MVP-0 functionality

- User registration and authentication (NextAuth).
- Project create, list and delete.
- Chat with the AI Analyst (prompt from the system specification).
- Document upload into a project (files, links) with RAG indexing (LlamaIndex + pgvector).
- Generating and displaying SPEC.md versions.
- Monaco code editor with a file tree.
- Git integration (commit history and diff browsing) via Gitea.
- Manual deploy: export of Dockerfile and docker-compose.yml (or a one-click build).
- ModelConfig setup per project (provider and model choice for the Analyst).

### 2.2. Detailed task plan (MVP-0)

#### Week 1

**Task 1.1. Project initialization** — done

- Create the Next.js repository, set up TypeScript, ESLint, Prettier.
- Bring up PostgreSQL, Redis, MinIO, Gitea via Docker Compose.
- Configure Prisma for the `public` schema (User, ProjectMeta, DeploymentMeta).
- Implement the script that creates a project schema when a `ProjectMeta` record is created.

Shipped: Yarn/Lerna monorepo scaffold, Compose infra (stock images +
`docker/dev-entrypoint.sh`), Prisma `public` + project-schema SQL from
`schema_project_template.prisma`. Layout in `docs/16-code-map.md`.

**Task 1.2a. Authentication and app shell** — done

- NextAuth v5 with the Prisma adapter and a Credentials provider.
- Application layout (header, side menu), sign-in page, dashboard shell.
- Guards `requireUser`, `requireProMode`, `canAccessProject`.

Two deviations from the original Task 1.2, both recorded in
`docs/14-decisions-needed.md`: Credentials ships instead of the Email magic link
and GitHub OAuth (both need external services that make local development
impossible), and the guard is named `requireProMode` rather than
`requireEngineer` because it checks `uiMode`, which is presentation and not a
permission boundary.

**Task 1.2c. Tailwind v4** — done

- Upgrade `apps/web` from Tailwind 3.4 to 4.3: `@tailwindcss/postcss`, tokens
  declared in CSS via `@theme`, `tailwind.config.js` deleted.
- `outline-none` → `outline-hidden` (v4 changed its meaning), and
  `source(none)` + explicit `@source` because auto-detection walks out of the
  repo on Windows.

**Task 1.2d. Design system** — done

- `packages/ui` becomes real: Button, Input + Field, Card, Spinner, plus the
  token layer at `@aiflow/ui/styles/theme.css` shared with `apps/web`.
- Existing 1.2a components migrated onto the primitives; `AppHeader` and
  `SideMenu` stay app-local.

Overrides conventions § 2.3 (a slice with one consumer should stay a slice) by
decision — rationale in `docs/14-decisions-needed.md` § D0. No component library
was adopted: primitives are hand-written, and there is no dark theme because
`09-ui-spec.md` § 9 mandates light only.

**Task 1.2b. Projects CRUD** — done

- Pages: dashboard project list, project card.
- API: create, list, delete a project.
- Create the `project_{uuid}` schema on project creation — the unfinished tail of
  Task 1.1, deferred pending open question #2 on migrations.
- Builds on the 1.2d primitives — `Card` exists for the project list.

Shipped: `features/projects` (compensation saga schema → Gitea → meta.create,
soft delete), dashboard list/card. Decisions in `docs/14-decisions-needed.md`
(project create flow, transport, delete confirm UI).

**Task 1.3. Researcher chat (MVP variant)** — done

- Build the chat UI (message list, input field).
- API route `/api/projects/[id]/chat` with SSE streaming of the AI response.
- Integration with routerai.ru via ModelRouter (no fallback, no cache).
- Persist dialogue history in the project schema (model `ChatMessage` — to be added to the schema).

Shipped on `task/1.3-researcher-chat`: `features/chat` (SSE + history),
`ChatMessage` in the project schema, `@aiflow/ai-roles` provider adapter.
Specs in `specs/task-1.3-researcher-chat/`.

#### Week 2

**Task 2.1. RAG and SPEC generator** — done

- Set up LlamaIndex (or equivalent) for indexing uploaded files.
- API for file upload (MinIO) and index runs.
- Implement the Analyst prompt using RAG context.
- SPEC.md generation on the "Create specification" command.
- Display SPEC.md with versions and version comparison.

Shipped on `task/2.1-rag-and-spec-generator`: `features/files` +
`features/specifications`, MinIO upload, LlamaIndex.Ts chunking + pgvector,
universal OpenAI-compatible embeddings/chat. Specs in
`specs/task-2.1-rag-and-spec-generator/`.

**Task 2.2. Code editor and Git integration** — done

- Integrate Monaco Editor with a file tree (data from the Gitea API).
- Implement a WebSocket connection for streaming files/state.
- Diff and commit history viewer component (via the Gitea API).
- API for creating a commit on the user's behalf.

Shipped on `task/2.2-editor-gitea`: `shared/gitea`, `features/editor`, Pro
`/projects/[id]/editor`, custom `apps/web/server.ts` WS hub, createProject
Gitea saga + lazy backfill. Specs in `specs/task-2.2-editor-gitea/`.

**Task 2.3. Manual deploy and ModelConfig** — done

- API for generating Dockerfile and docker-compose.yml from a template.
- "Build" button — image build via dockerode.
- ModelConfig settings page (provider/model choice for the Analyst).

Shipped on `task/2.3-deploy-modelconfig`: `@aiflow/crypto`, ModelConfig UI/API,
chat provider resolve, `@aiflow/queue` + worker `deploy:run` (dockerode,
dev-only sock), deployments UI. Specs in `specs/task-2.3-deploy-modelconfig/`.

**MVP-0 exit criterion:**

- A new user registers, creates a project, talks to the Analyst, receives SPEC.md.
- The Engineer can open the code editor, create a file, commit and click "Build" — getting a ready Docker image.

---

## 3. Iteration MVP-1 (slim) – Planner + sandbox Coder

**Goal (slim MVP-1, decided 2026-08-07):** Planner + Aider Coder in isolated
sandboxes for **simple CRUD** apps. Product gate = sandbox automated checks
(TypeScript, ESLint `--max-warnings 0`, Prettier, `prisma validate`) — not an
LLM Reviewer. Narrow E2E path: idea → SPEC → plan → codegen → existing manual
deploy. Full Reviewer / Support Bot / domain deploy / self-dogfood / load work
moves to **MVP-2** (see § 3.3). Rationale: open questions #7–#8 in
`docs/12-open-questions.md`.

### 3.1. Slim MVP-1 functionality (added to MVP-0)

- Planner: automatic task generation from SPEC.md.
- Aider-based Coder in isolated Docker sandboxes (simple CRUD scope).
- Sandbox acceptance checks (lint/typecheck/validate) as the product gate.
- Bootstrap from `templates/user-nextjs/` into the project Gitea repo.
- Reuse MVP-0 manual deploy (`deploy:run`) for the generated image.

### 3.2. Detailed task plan (slim MVP-1)

#### Weeks 3–4: Planner, sandboxes and Coder

**Task 3.1. Sandbox infrastructure** — done

- Create the `aider-sandbox` Docker image (Node.js + Python + pinned Aider version).
- Configure dockerode to start containers with restrictions (read-only, tmpfs, network).
- Implement the `registry-proxy` container with a URL allowlist.
- Runner script inside the sandbox: accepts a task (JSON via env), runs Aider, returns the result.

Decided for 3.1 (I0, 2026-08-07): lint failure is **fatal** in the runner
(`--max-warnings 0`); API key arrives via read-only file mount at
`/run/secrets/api_key` (not env) — see `docs/12-open-questions.md` #5.
Aider pin and `registry-proxy` shape: C4/C5 in `docs/14-decisions-needed.md`.

**Task 3.2. Planner** (done 2026-08-07)

- Develop the prompt for generating a task list from SPEC.md (in a format the Coder understands).
- Integration with the `plan:generate` queue: fetch SPEC.md, call the LLM, parse, create `Task` records.
- UI for the Roadmap (task list with order and dependencies); drag-reorder deferred.

**Task 3.3. Coder** (done 2026-08-07)

- Worker `code:execute`: takes a task, fetches current code from Gitea, starts a sandbox.
- Result handling: commit on success (runner), worker push, log capture and FAILED marking on failure.
- Dry-run mode: planned prompt stub → `AWAITING_REVIEW`, confirm enqueues live run.
- WebSocket streaming of sandbox logs (`sandbox:logs:{taskId}` via custom server).
- Slim MVP-1: no LLM Reviewer — product gate = sandbox checks only.

### 3.3. Deferred to MVP-2

Moved out of slim MVP-1 so Planner+Coder can stabilize first
(`docs/12-open-questions.md` #7–#8):

**Task 4.1. Acceptance loop (LLM Reviewer + test generation)**

- Unit test generation by an agent (a separate task after the Coder).
- Running ESLint, TypeScript, Prisma validate in the sandbox (checks themselves ship in 3.1; the LLM Reviewer and generated-test loop stay here).
- Reviewer: an LLM agent that receives the diff and acceptance criteria and issues a verdict.
- UI for check results.

**Task 4.2. Embeddable Support Bot**

- Support agent template based on Dify (or a lightweight RAG equivalent).
- Trained on SPEC.md and project documentation.
- API for embedding into the target application (chat widget or iframe).
- Including the bot in the final build (added to docker-compose).

**Task 4.3. Automatic domain deploy**

- Worker `deploy:run` extended: builds the Docker image with the application and agents.
- Deployment to a test domain (based on Traefik or an nginx proxy).
- URL and logs surfaced in the project UI.

**Task 5.1. Full dogfooding**

- Create the "AI Studio" project inside the platform.
- Upload the SPEC.md produced during design.
- Run the full cycle: planning → code generation → deploy (goal: a working Analyst chat prototype).
- Record problems, apply fixes.

**Task 5.2. Load testing**

- Simulate 3 concurrent projects.
- Verify schema and sandbox isolation.
- Bull Board monitoring, error logging.

**Task 5.3. Stabilization and documentation**

- Fix critical bugs.
- Write the README and a guide for first users.
- Prepare for launch (production environment deployment).

---

## 4. Slim MVP-1 readiness criteria

1. A **Customer** with no technical knowledge gets a simple CRUD web app coded by the sandbox Coder from an approved SPEC (Planner → Coder); deploy may still use the MVP-0 Build path.
2. An **Engineer** can change code manually, and subsequent generation does not overwrite those changes (file or branch locking mechanism).
3. Sandbox checks are the product gate: check failure → FAILED; success → commit. No product LLM Reviewer until MVP-2.
4. All secrets are stored encrypted; sandbox API key is file-mounted (`/run/secrets/api_key`); project isolation holds for the concurrent projects exercised in MVP-0/1.
5. Narrow dogfood: at least one simple CRUD app through plan → sandbox codegen (full self-dogfood and load testing → MVP-2).

## 5. Tools and repositories

- **Code**: a monorepo in Gitea (Next.js, workers, Docker Compose configuration).
- **CI/CD**: for MVP, manual test and build runs via scripts. Later, integration with Gitea Actions.
- **Documentation**: kept in the AI Studio `SPEC.md` and updated as dogfooding proceeds.

## 6. Risks and mitigation

| Risk                              | Likelihood | Impact   | Mitigation                                                     |
| --------------------------------- | ---------- | -------- | -------------------------------------------------------------- |
| Aider cannot handle complex tasks | High       | Critical | Fine-grained task decomposition, manual intervention available |
| Docker isolation problems         | Medium     | High     | Hard limits, security testing                                  |
| Dependency on routerai.ru         | Medium     | High     | Fallback to OpenAI/Anthropic, caching                          |
| Schedule slip due to scope        | High       | Medium   | Two iterations, MVP-0 as a buffer                              |

---

## Technical debt

Deferred items per `docs/15-engineering-conventions.md` § 5.5. An item that
survives two roadmap tasks is either promoted to a real task or deleted.

| What                                                                                                                         | Where                                                                                                              | Why deferred                                                                           | Blocks                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Feature-slice line budget (400) overrun — `editor` ~2600 non-test lines                                                      | `apps/web/src/features/editor`                                                                                     | Cohesive Pro editor; internal hooks split (2026-08-07) but slice still >>400 by design | Future editor features may need further internal splits; not a merge blocker |
| Slice budget overrun — `files` ~720, `deploy` ~720, `model-config` ~650, `projects` ~650, `specifications` ~510, `chat` ~485 | `apps/web/src/features/{files,deploy,model-config,projects,specifications,chat}`                                   | Capability-sized slices; file-level max-lines gate already holds                       | Soft DoD § 5.3 — this row is the debt entry                                  |
| Near-limit modules (~170–194 lines) kept cohesive                                                                            | `shared/gitea/client.ts`, `files/model/index-service.ts`, `deploy/ui/useDeployments.ts`, `deploy/model/service.ts` | Audit 2026-08-07: no second concern; do not split for count alone                      | Headroom before next feature                                                 |
| `ingest-repo.ts` >200 lines                                                                                                  | `apps/web/scripts/ingest-repo.ts`                                                                                  | Script exemption (conventions § 3); one-shot RAG ingest                                | None                                                                         |

### Cleared in refactor series 2026-08-07

- `FilePanel.tsx` at 200 lines → split into `FileRow` + `file-panel-upload` (~76-line panel).
- Editor WS `attachEditorWebSocket` deep import → re-exported from `features/editor` barrel; `server.ts` imports the barrel.
- Sandbox runner lint-as-warning → lint is **fatal** in `docker/aider-sandbox/runner-checks.js` (`--max-warnings 0`); cleared with Task 3.1 (2026-08-07).
