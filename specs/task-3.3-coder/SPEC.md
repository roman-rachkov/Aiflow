# Task 3.3 — Coder pipeline (slim MVP-1)

## Goal and context

Wire `code:execute`: the worker loads a Task, clones the project from Gitea,
optionally runs the Aider sandbox (Task 3.1), streams logs to TaskLog + Redis
for WebSocket UI, and marks DONE/FAILED. Dry-run shows the planned prompt and
waits for confirmation (`AWAITING_REVIEW`) — no LLM Reviewer in slim MVP-1;
the product gate is sandbox checks only.

## Users and roles

- **Engineer (Pro):** enqueue dry-run / confirm / execute; watch live logs.
- **Customer:** sees task status on the roadmap (Russian UI strings).

## Functional requirements

### Job "code queue payload"

- **Scope**: mvp-1
- `CodeExecutePayload`: projectId, schemaName, taskId, gitea*, dryRun, optional
  branchName. `getCodeQueue()` producer in `@aiflow/queue`.

### Job "code:execute worker"

- Soft-delete filter on Task; IN_PROGRESS + TaskLog; clone; branch
  `task/{shortId}-{slug}`.
- dryRun=true: no container; log plan stub; status AWAITING_REVIEW; success.
- dryRun=false: secret file mount, sandbox, stream logs, parse RESULT, push on
  success → DONE; else FAILED. docker.sock DEV-ONLY warn like deploy.

### Job "execute / confirm APIs + UI"

- POST execute `{ dryRun? }`, POST confirm (after dry-run), Pro only.
- Minimal roadmap list + ExecuteControls + live log panel (WS Redis
  `sandbox:logs:{taskId}`).

## Non-functional requirements

- Next.js enqueues only; no dockerode in the app.
- File ≤ 200 lines / function ≤ 50 (ESLint `--max-warnings 0`).
- Soft-delete: `deletedAt: null` on Task reads/updates.

## Assumptions

- API key: `OPENAI_API_KEY` (or ModelConfig later) written to a temp secret file.
- Runner commits inside the sandbox on gate success (Task 3.1); worker pushes.
- Task 3.2 Planner may land in parallel — extend `features/tasks` if present.
