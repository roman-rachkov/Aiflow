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

**Task 3.3. Coder** (done 2026-08-07; E2E wiring 2026-08-17)

- Worker `code:execute`: takes a task, fetches current code from Gitea, starts a sandbox.
- Result handling: commit on success (runner), worker push, log capture and FAILED marking on failure.
- Dry-run mode: planned prompt stub → `AWAITING_REVIEW`, confirm enqueues live run.
- WebSocket streaming of sandbox logs (`sandbox:logs:{taskId}` via custom server).
- Slim MVP-1: no LLM Reviewer — product gate = sandbox checks only.
- 2026-08-17: template bootstrap into Gitea; ACCEPTED fast-forwards into `main`;
  «Запустить план» enqueues the unblocked DAG; deploy `db push` into `app_{hex}`.

### 3.3. Deferred to MVP-2

Moved out of slim MVP-1 so Planner+Coder can stabilize first
(`docs/12-open-questions.md` #7–#8):

**Task 4.1. Acceptance loop (LLM Reviewer + test generation)** — partial (2026-08-11)

- Unit test generation by an agent (a separate task after the Coder). **Deferred.**
- Running ESLint, TypeScript, Prisma validate in the sandbox (checks themselves ship in 3.1; the LLM Reviewer and generated-test loop stay here).
- Reviewer: an LLM agent that receives the diff and acceptance criteria and issues a verdict. **Shipped (one-shot):** queue `code-review`, `@aiflow/ai-roles` `generateReviewVerdict`, worker handler; after sandbox green + push, code-execute enqueues review (stays `IN_PROGRESS`); ACCEPTED → `DONE`, REJECTED → `PENDING` + `=== REVIEW ===` TaskLog. Self-Refine retry loop → MVP-3 C1.
- UI for check results. **Shipped (MVP):** `ReviewVerdictCard` parses the latest review log on the tasks panel. Full D1 verdict UI later.

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

## 4. MVP-2 — product features (formalized from § 3.3)

**Goal:** ship the product features deferred out of slim MVP-1 so the platform
becomes usable end-to-end without a human in every loop. These tasks were already
defined in § 3.3 (4.1–4.3, 5.1–5.3) — this section fixes their scope as a phase.
MVP-3 (§ 5) then adds the agent-maturity layer _under_ them.

- **4.1 Acceptance loop (LLM Reviewer + test generation)** — unit-test generation
  agent; Reviewer LLM agent over diff + acceptance criteria; check-results UI.
- **4.2 Embeddable Support Bot** — Dify or lightweight RAG equivalent on SPEC +
  docs; embed widget/iframe; included in the final build.
- **4.3 Automatic domain deploy** — `deploy:run` extended to a real test domain
  (Traefik / nginx proxy); URL + logs surfaced in the project UI.
- **5.1 Full dogfooding** — the "AI Studio" project run through the full cycle
  (plan → codegen → deploy) inside the platform.
- **5.2 Load testing** — ~3 concurrent projects; schema + sandbox isolation
  verified; Bull Board monitoring.
- **5.3 Stabilization and documentation** — critical fixes; README + first-user
  guide; production-environment prep.

**MVP-2 does not add agent maturity by itself.** Reviewer ships as a one-shot
verdict; there is no persistent agent memory, no LLM observability, no policy
layer. Those land in MVP-3 and retrofit onto these features (Reviewer becomes a
Self-Refine loop in 5/C1, deploy becomes auditable in 5/A3, etc.).

---

## 5. MVP-3 — Agent Maturity (planned)

**Goal:** turn the probabilistic LLM roles into a _managed system_ — durable,
observable, policy-bounded, self-improving — as framed by the article "От
болтливых LLM-агентов к управляемым системам" (Habr 1068168). MVP-3 sits _on top
of_ MVP-2: it does not add new user-facing surfaces, it makes the existing ones
reliable and measurable. Decisions E1–E4 in
[14-decisions-needed.md](14-decisions-needed.md) fix the approach.

The article's thesis is that a mature agent combines probabilistic LLM logic with
strict deterministic architecture (durable execution, sandbox, memory, rights +
audit, human-in-the-loop, observability/evals). AI Studio already covers sandbox
isolation, AG-UI, the Redis-disposable + Postgres-checkpoint invariant, and
Supervisor-worker (Planner→Coder). MVP-3 closes the remaining gaps.

### 5.1 Tracks and tasks (skeleton)

Each task is a heading + goal + integration point + readiness criterion. Micro-
decomposition happens per task in its own brainstorm/sprint, on a `task/*` branch.

#### Track A — Architectural maturity (durable + audit + policy)

**A1. Idempotent workers (`code:execute`, `deploy:run`).** — done (2026-08-23)

At-least-once without duplicate effect (double commit/deploy/`markInProgress`).
Integration: `apps/worker/src/code/handler.ts` + `claim.ts`,
`apps/worker/src/deploy/handler.ts` + `claim.ts`. Shipped: conditional
`claimInProgress` (`PENDING`|`AWAITING_REVIEW`|`FAILED` → `IN_PROGRESS`, clears
git checkpoint); stalled `IN_PROGRESS` resumes; `headCommit` recorded **before**
push so crash mid-push → `resume-after-push` (skip sandbox, re-push + re-enqueue
review); DONE / DEPLOYED are no-op skips; `finishDeploy` only transitions from
`BUILDING`. BullMQ still fail-fast (`attempts: 1`); operator re-enqueues after
FAILED. Step-encoded pipeline resume shipped in A2.

**A2. Status machine as source of truth + resumability.** — done (2026-08-23)

A crashed worker resumes from the last durable checkpoint, not from zero.
Integration: `TaskLog` step markers + `headCommit` / git checkpoint ref,
`apps/worker/src/code/pipeline{,-live,-steps}.ts`, `git-checkpoint.ts`.
Steps: `CLONE→CHECKOUT→SANDBOX→PARSE→PUSH→DONE` (DONE = enqueue
`code-review`). PARSE pushes `refs/aistudio/task/{taskId}` before recording
`headCommit` so a mid-PUSH crash restores the commit after workDir wipe.
Resume: no `headCommit` → restart at CLONE; with `headCommit` → PUSH or DONE
from TaskLog; all steps done → no-op wait for review. Doc-test: crashed on
PUSH → restart → sandbox skipped, push once.

**A3. Audit trails.** — done (2026-08-23)

Every significant role action (Coder commit, Reviewer verdict, deploy) is an
audit event. Integration: `AuditEvent` model in the public schema (actor role,
action, target, before/after hash, optional Langfuse `traceId`), append-only
(soft-delete exempt). Approach: `recordAudit()` in `@aiflow/db` + worker
wrappers (`auditCoderPush` / `auditReviewerVerdict` / `auditDeployFinish`)
hooked at PUSH, review settle, and deploy finish; Pro-mode event feed via
`GET /api/projects/[id]/audit` + `features/audit` UI composed on the tasks
page. Stacked on A2 (pipeline step hooks). Done criterion: a `taskId`
reconstructs its full attempt + verdict history from `AuditEvent` rows.

**A4. Policy layer for roles.** — done (2026-08-23)

A deterministic guard "what a role may do" _before_ the LLM call; tool-calling
capability ≠ permission (E4). Integration: `packages/ai-roles/src/policy.ts`
(role → capability set: `read-spec`, `read-diff`, `write-commit`, `verdict`,
…); `withPolicyGuard` on `createOpenAICompatibleProvider`; Planner/Reviewer
bind role via `runWithRoleAsync` + `assertCapability`; coder PUSH asserts
`write-commit`. Violation → `policy.violation` AuditEvent +
`PolicyViolationError`. Done criterion: Reviewer physically cannot
`write-commit` even under injection (unit-tested).

#### Track B — Observability & Evals (Langfuse)

**B1. Langfuse self-host in compose.** Service in `docker-compose.yml`,
Postgres-backed, OTLP receiver. Done when `docker compose up` brings up the
Langfuse UI on a dedicated port.

**B2. Trace every LLM call.** Prompt/tokens/latency/cost/errors for
Analyst/Planner/Coder/Reviewer, linked to project/task. Integration: the wrapper
in `packages/ai-roles/src/openai-compatible.ts`
(`createOpenAICompatibleProvider`) — the single chokepoint of all roles. Approach:
OTel/Langfuse-SDK spans; `traceId` propagates into `TaskLog`/`AuditEvent` for
cross-link. Done when a single Coder attempt is visible end-to-end in Langfuse.

**B3. Evals framework (golden set + regression).** A SPEC→plan→code case set;
prompt/model regression on change. Approach: Promptfoo or Langfuse datasets; a CI
job fires when a prompt in `.claude/agents/` changes. Done when a Coder prompt
change cannot merge without an evals run.

**B4. Prompt-injection red-team.** Uploaded RAG documents must not break policy or
exfiltrate the key. Integration: the Analyst mixes user content into its system
prompt via `withRagContext` — the known surface. Approach: an AgentDojo/
InjecAgent-style red-team set, auto-run in CI. Done when an injected document
never triggers a role's write action.

#### Track C — Agent intelligence (Self-Refine, memory, escalation)

**C1. Reviewer runtime (Self-Refine loop)** — enriches MVP-2 task 4.1. Implement
the `reviewer.md` contract at runtime: `code:execute` DONE → Reviewer(diff + AC +
checks) → ACCEPTED (DONE) | REJECTED (→ Coder with feedback memory → Reviewer
again). Integration: new `code:review` queue + worker handler; `packages/ai-roles`
gains `reviewer.ts`/`reviewer-prompt.ts` mirroring planner. Approach: retry cap
(e.g. 3), then FAILED + manual; memory from C2 is mixed into the retry prompt.
Done when a REJECTED task returns to PENDING with the verdict logged and reaches
ACCEPTED or FAILED within the cap.

**C2. Persistent agent memory (Reflexion).** Coder/Reviewer remember a task's past
failures and do not repeat them. Integration: new `AgentMemory` model in the
project schema (taskId/role/lesson); mixed into the Coder prompt (sandbox runner)
and Reviewer. Approach: extract a "lesson" from each Reviewer verdict, store it,
retrieve by task similarity. Done when a repeated identical task does not fail the
same way.

**C3. Escalation to an advisor model (decision points)** — closes open question #9.
Cheap primary + strong advisor at structural decisions (e.g. the Planner dependency
graph). Integration: `services/model-router` (currently a stub) implements
escalation as a second routed request; `ModelConfig.config` gains an optional
`advisor` per role. Approach: worker-decided trigger points (before planning, on
repeated failure, before marking complete) for predictable cost. Done when Planner
escalation fires on repeated failure; advisor ≥ primary in capability (the
constraint from the article / Anthropic).

**C4. Tree-of-Thoughts — surgical, not blanket.** Only where it pays off (hard
Planner decomposition). Approach: an optional Planner ToT mode (several plans →
score → pick). Done when it is behind a flag and evals show a win over baseline.
Not applied blindly to every role (the article's "theatre of agents" warning).

#### Track D — Product features (enriching MVP-2 4.1–4.3)

These tasks already sit in MVP-2; MVP-3 gives them their "mature" implementation
through A/B/C.

**D1. Reviewer UI** — verdict list, issues with file/line, an auto-approve
threshold on `confidence`. **D2. Support Bot** (4.2) — Dify/lightweight RAG on
SPEC + docs; embed widget; into the final compose; memory/retrieval reuses the
existing pgvector stack. **D3. Automatic domain deploy** (4.3) — Traefik/nginx,
real URL over `deploy:run`; deploy becomes an audit event (A3) and idempotent
(A1). **D4. Dogfooding + load + stabilization** (5.1–5.3) — now with observability
(B2) and evals (B3) as part of the definition of "done".

### 5.2 Execution order (dependencies)

```
A1 → A2 → A3 → A4          (maturity — foundation)
B1 → B2 → B3, B4           (observability — parallel with A)
C1 (needs A4 policy)       (Reviewer runtime)
C2 (needs C1)              (memory — on top of verdicts)
D1 (needs C1)              (verdict UI)
C3 (needs B2 tracing)      (escalation)
C4 (needs B3 evals)        (ToT — data-driven)
D2, D3 (need A1, A3)       (product)
D4 (needs B2, B3)          (dogfood with metrics)
```

Recommended waves: (1) **Foundation** — A1, A2, B1, B2: idempotency +
observability skeleton. (2) **Agent** — A3, A4, C1, D1: audit/policy + Reviewer
loop + UI. (3) **Intelligence** — C2, C3, B3, B4: memory + escalation + evals +
red-team. (4) **Product** — D2, D3, C4, D4: Support Bot, domain deploy, ToT,
dogfooding.

### 5.3 Explicitly out of scope for MVP-3

Rejected as anti-patterns or out of current need (the article warns against
"theatre of agents"): a full multi-agent group chat (roles with equal rights and
context — AI Studio keeps Supervisor-worker); the A2A federation protocol (the
product is internal, federation is post-MVP); browser automation for roles
(Playwright/Browser Use — no autonomous web-action task; sandbox-Coder only); a
heavy external memory stack (Mem0/Zep/Letta — own `AgentMemory` + pgvector
suffice, revisit on C2 data).

### 5.4 MVP-3 readiness criteria

1. A role action replayed after a crash has exactly one real-world effect (A1, A2).
2. Every role's LLM call is traceable in Langfuse end-to-end and linked to the
   task/audit record (A3, B2).
3. A role cannot exceed its capability set even under prompt injection (A4, B4).
4. A REJECTED task self-corrects within the retry cap or fails loudly (C1, C2).
5. MVP-2 features (Reviewer, Support Bot, domain deploy) ship _on_ this layer, not
   beside it (D1–D3).

---

## 6. Slim MVP-1 readiness criteria

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
