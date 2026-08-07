# Task 3.2 — Planner (slim MVP-1)

## Goal and context

Эта спецификация описывает задачу 3.2: Planner создаёт атомарные `Task` из
утверждённого SPEC.md, worker обрабатывает очередь `plan:generate`, UI
показывает roadmap. LLM Reviewer и `code:execute` — вне scope (MVP-2 / 3.3).

## Users and roles

- **Владелец проекта (Pro)**: утверждает SPEC, запускает «Сгенерировать план»,
  смотрит список задач.
- **Worker**: читает Specification, вызывает LLM, пишет Task + TaskDependency.

## Functional requirements

### Job "plan:generate queue"

- **Scope**: mvp-1
- Payload: `projectId`, `schemaName`, `specificationId`, `specificationVersion`.
- Handler: load Specification (`deletedAt: null`, `approvedAt` set), LLM plan,
  soft-delete replaceable prior tasks (PENDING/FAILED/CANCELLED only), insert
  tasks + dependency edges by title, append TaskLog.

### Job "Planner LLM parse"

- **Scope**: mvp-1
- System prompt aligned with `docs/06-prompt-planner.md` JSON schema.
- JSON validate + up to 2 retries on parse failure (C3). Env provider in worker.

### Screen "Tasks / Roadmap"

- **URL**: `/projects/[id]/tasks`
- **Scope**: mvp-1
- List title, status (RU), priority, deps summary; button «Сгенерировать план»
  (Pro). GET/POST API under `/api/projects/[id]/tasks`.

## Non-functional requirements

- Soft-delete only; never wipe DONE/IN_PROGRESS.
- FSD: `features/tasks` barrel; `app/` routing only.
- File ≤ 200 lines, fn ≤ 50, complexity ≤ 10.
- User-facing strings Russian; code/comments English.

## Assumptions and open questions

- Bootstrap `templates/user-nextjs/` into empty Gitea on createProject is skipped
  (Planner does not require it; note for 3.3 / provisioning follow-up).
- Drag-and-drop reorder deferred; `sortOrder` comes from planner array order.
- `needsConfirmation` from planner JSON is accepted but not persisted (no column).
