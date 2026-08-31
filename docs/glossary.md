# AI Studio glossary

Terms linking product language (often Russian UI), docs, and code. English in docs;
UI strings may be Russian per language policy.

## ADR / doc hierarchy (docs-autopilot)

When documents conflict during autopilot:

1. `CLAUDE.md` + `docs/` (source of truth for this repo)
2. `docs/14-decisions-needed.md` resolved table
3. `docs/12-open-questions.md` status table
4. `notes/` — ideas only until promoted to roadmap

Product user-facing copy: user's language. Internal agent traffic: English.

## Roles (personas & AI)

| Term | Code / doc | Meaning |
| ---- | ---------- | ------- |
| Customer / Aunt Zina | UI mode `BASIC` | Non-technical user; chat-first workflow |
| Engineer / Uncle Vasya | UI mode `PRO` | Planner, coder enqueue, editor, model config |
| Analyst | `docs/05`, `.claude/agents/analyst.md`, chat worker | Interviews user, produces `SPEC.md` |
| Planner | `docs/06`, `plan-generate` queue | SPEC → JSON task array |
| Coder | `docs/07`, `code-execute`, Aider sandbox | One atomic task per branch |
| Reviewer | `docs/08`, `code-review` queue | Verdict JSON; MVP-2 product gate |
| Deployer | roadmap 4.3, worker `deploy-run` | Build image + deploy (no prompt file yet) |

## UI (Russian ↔ routes)

| Russian (UI) | Route / shell | Component |
| ------------ | ------------- | --------- |
| Проекты | `/projects` | `ProjectList` |
| Исследование | `/projects/[id]/research` → redirect home | legacy `AppNav` link |
| (project home / chat) | `/projects/[id]` | `ProjectShell` / `AgentInterface` |
| Задачи | shell `tasks` or `/projects/[id]/tasks` | `TasksPanel` |
| Развёртывания | shell `deploy` or `/deployments` | `DeploymentsPanel` |
| Редактор | `/projects/[id]/editor` | `EditorShell` |
| Модели | shell `models` or `/settings/models` | `ModelSettingsForm` |
| Утвердить (SPEC) | — | `SpecApproveButton` |

## Artifacts

| Term | Location | Notes |
| ---- | -------- | ----- |
| `SPEC.md` | Gitea repo root | Hybrid: English headings, user-language body |
| `Task` | per-project schema | Planner output; branch `task/{id}-{slug}` |
| `TaskLog` | per-project schema | Progress checkpoint; Redis disposable |
| `ChatThread` | per-project schema | OpenUI thread list backing store |

## Tech one-liners

| Term | Meaning |
| ---- | ------- |
| OpenUI | `@openuidev/react-ui` — `AgentInterface` chat shell in `apps/web` |
| AG-UI | Agent UI event protocol; SSE from `/threads/{tid}/run` |
| `chat-run` | BullMQ queue; worker owns tool loop + SPEC generation tool |
| pgvector | Embeddings in per-project `DocumentChunk`; RAG retrieval |
| `registry-proxy` | Sandbox-only egress allowlist (npm registry) |
| `aiflow-rag` | Dev MCP over `apps/web/scripts/rag-mcp.ts` |
| FSD | Feature-sliced design — `app → features → shared → packages` |
| `boundaries/dependencies` | ESLint rule enforcing cross-slice isolation in `apps/web` |

## Autopilot gates

| Gate | Meaning |
| ---- | ------- |
| `DOCS_COMPLETE` | No 🔴 open in `DOC_GAPS.md`; specs consistent enough for Wave B |
| `APP_COMPLETE` | `REQUIREMENTS.md` open registry empty; smoke evidence per DoD |
