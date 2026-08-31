# AI Studio – User Interface Specification (MVP)

## 1. Overview

AI Studio is a responsive web application built around two roles: Customer (Aunt Zina) and Engineer (Uncle Vasya). The Customer works only with the researcher chat and the project card; the Engineer also has the code editor, model settings, and the task panel.

## 2. Screen Map and Navigation

Two layout groups (see § 9):

- **`(app)` layout** — `AppHeader` + horizontal `AppNav`. Project list and create.
- **`(shell)` layout** — full-bleed `ProjectShell` (`AgentInterface`, 100dvh). No
  `AppHeader`; navigation lives in the chat sidebar.

```
/ (after login) → redirect /projects
/projects → Dashboard (project list, app layout)
/projects/new → Create project (app layout)
/projects/[id] → Project home — PRIMARY (shell: chat + sidebar tools)
/projects/[id]/research → redirect → home (legacy URL)
/projects/[id]/chat → redirect → home (legacy preview URL)
/projects/[id]/tasks → Tasks (standalone deep link; same panel as shell Route)
/projects/[id]/deployments → Deployments (standalone deep link)
/projects/[id]/editor → Code editor (Monaco + WS; separate page, not in shell)
/projects/[id]/settings/models → Model settings (Pro; standalone or shell Route)
/projects/[id]/agents → Project agents (not shipped — MVP-2 Support Bot)
/settings/profile → Profile settings (planned)
```

**Customer primary path:** open project → home shell (chat). Files, tasks, deploy,
and SPEC are **sidebar Route panels** inside the shell (`files`, `tasks`, `deploy`,
`spec`). **Engineer (Pro)** also sees Models in the sidebar and an Editor link that
opens `/editor`.

**Legacy `AppNav`** (horizontal, app layout only) still lists «Исследование» →
`/research` (redirects to home). Deep links to `/tasks` and `/deployments` remain
valid outside the shell.

## 3. Screen: Dashboard

**URL:** `/`
**Purpose:** list the user's projects, create a new one.

### Components

- **Header:** AI Studio logo, profile icon (logout, settings).
- **"New project" button:** opens a modal with a "Project name" field and a "Create" button.
- **Project list:** project cards showing:
  - Name.
  - Last build status (icon: green — deployed, yellow — building, red — failed).
  - Last modified date.
  - Buttons: "Open", "Delete" (with confirmation).
- **Empty state:** icon, text "You have no projects yet. Create your first project to get started."

### Behavior

- On project creation the user is redirected to the Researcher at `/projects/[id]/research`.

## 4. Screen: Project home (Analyst chat shell)

**URL:** `/projects/[id]` (canonical). Legacy `/projects/[id]/research` redirects here.
**Purpose:** interview with the AI Analyst, multi-thread chat, SPEC generation via
tools, and sidebar access to files / tasks / deploy / SPEC / models.

**Implementation:** `ProjectShell` + OpenUI `@openuidev/react-ui` `AgentInterface`
(`apps/web/src/app/(shell)/projects/[id]/_shell/`). Russian labels in
`features/chat/ui/agui/labels.ts`.

### Layout

Full-viewport `AgentInterface` (shell layout — no top `AppHeader`):

- **Sidebar (left):**
  - Project title header.
  - «Новый чат» (`AgentInterface.NewChatButton`).
  - **Thread list** (`AguiThreadList`) — rename, fork, delete per thread.
  - **Tool nav** (`SidebarNav`) — Route panels: Files, Tasks, Deploy, SPEC;
    Pro adds Editor (navigates to `/editor`) and Models.
- **Main (center, default):** chat with the Analyst.
  - AG-UI streaming via `POST /threads/{tid}/run` → worker `chat-run` queue.
  - Welcome screen with starters (including SPEC generation starter).
  - Custom message renderers: copy / regenerate / edit / delete (Stage A).
  - Composer at bottom (Russian placeholder).
- **Route panels (replace chat when a sidebar tool is selected):**
  - **Files** (`path=files`) — upload + index (`FilePanel`).
  - **Tasks** (`path=tasks`) — `TasksPanel` (plan enqueue, execute controls, logs).
  - **Deploy** (`path=deploy`) — `DeploymentsPanel`.
  - **SPEC** (`path=spec`) — latest SPEC markdown + «Утвердить» (`SpecApproveButton`).
  - **Models** (`path=models`, Pro) — Analyst `ModelSettingsForm`.
- **SPEC artifact in chat:** tool result renders as OpenUI artifact card
  (`spec-artifact-renderer`) with preview + approve in the message stream.

Routes must be **direct children** of `AgentInterface` (shallow slot extract —
see `ProjectRoutes.tsx`).

### States

- **Streaming reply:** AG-UI run in progress (composer disabled while running).
- **SPEC tool / generation:** artifact card + worker-side `spec:generate` tool in
  the chat loop (not a separate page-level progress bar).
- **Error:** surfaced in chat or panel fetch errors (inline; no global toast yet).

### Customer actions

1. Opens project → lands on chat (welcome or active thread).
2. Describes the idea; answers clarifying questions in chat.
3. Triggers SPEC via starter or Analyst tool → reviews artifact / SPEC Route panel.
4. Clicks «Утвердить» on SPEC → `approveSpecification`.
5. Opens **Tasks** sidebar panel (or `/tasks`) → enqueue plan / watch execution
   (Pro: «Сгенерировать план»; live sandbox logs over WebSocket).

### Engineer actions

- Upload and index files via **Files** Route panel.
- Configure Analyst model via **Models** panel (Pro).
- Manual code edits via **Editor** link (separate Monaco page).
- Monaco-based SPEC edit is **not** in the shell yet — SPEC is viewed/approved in
  the Route panel; full markdown edit deferred.

## 5. Screen: Tasks and Roadmap

**URL:** `/projects/[id]/tasks` (standalone page) **or** shell Route `tasks`
(sidebar «Задачи»). Same `TasksPanel` component in both places.
**Purpose:** review the plan and task execution status.

### Components

- **Top bar:**
  - "Start generation" button (if the plan has not been started).
  - "Restart everything" button (with confirmation).
  - Overall progress indicator: "3/10 tasks completed".
- **Timeline / Roadmap (left side):** vertical task list with connecting lines (dependencies).
  - Each task: title, status (icon: pending, in progress, review, done, error), priority (color label).
  - Clicking a task opens its details on the right.
- **Task details (right side):**
  - Title, full description, acceptance criteria.
  - Execution status.
  - Execution log (TaskLog) — scrollable text block with timestamps.
  - Buttons: "Restart task" (if failed), "View diff" (link to the editor in diff mode).

### States

- Plan not generated: "Generate plan" button (available after the specification is approved).
- Plan generating: loading indicator.
- Tasks executing: statuses update in real time over WebSocket.

## 6. Screen: Code Editor (Engineer only)

**URL:** `/projects/[id]/editor`
**Purpose:** manual code editing, Git history review.

### Layout

- **Left panel:** project file tree (hierarchy, file type icons).
  - Clicking a file opens it in the editor.
  - Context menu: create file/folder, delete, rename.
- **Center:** Monaco Editor with syntax highlighting and autocomplete.
  - Tabs for open files.
- **Bottom panel:** terminal (WebSocket connection to the sandbox or command output).
- **Right panel (togglable):**
  - Git history: commit list with messages and author (AI/user).
  - Diff viewer: changes in the selected commit.

### Behavior

- A manually changed file is marked "modified" in the tree.
- "Save" (or Ctrl+S) saves the file and commits on behalf of the user.
- "Build" starts a deployment.
- If the Engineer manually changes a file that is also part of an active coder task, the system must warn and offer a resolution (block the task or create a separate branch).

## 7. Screen: Project Agents (Engineer only)

**URL:** `/projects/[id]/agents`
**Purpose:** manage embeddable agents (chatbots, support).

### Components

- Active agent list (table): name, type, status (active/inactive), creation date.
- "Add agent" button → choose from templates:
  - "Support Bot" (RAG over SPEC.md and documentation).
  - "Custom agent" (unavailable in MVP, shows "Coming soon").
- Selecting a template opens a configuration card:
  - Agent name.
  - Knowledge sources (automatically SPEC.md + uploaded files).
  - "Train" button — starts document indexing.
  - Chat widget preview.
- After training, the agent becomes embeddable (in MVP via an iframe or a JavaScript snippet to paste into the target application).

## 8. Screen: Deployment History

**URL:** `/projects/[id]/deployments` (standalone) **or** shell Route `deploy`
(sidebar «Развёртывания»). Same `DeploymentsPanel`.
**Purpose:** review deployment statuses and logs.

### Components

- Deployment table: date, status (icon), version (image tag), URL (if deployed).
- Clicking a row opens the full build log.
- "Deploy now" button (starts a new build from the current repository state).

## 9. Shared Elements and States

### Navigation (two surfaces)

**Project shell (primary):** sidebar inside `AgentInterface` — threads + tool
Routes (Files / Tasks / Deploy / SPEC / Models) + Editor link (Pro). No horizontal
project nav in the shell layout.

**App header nav (legacy / list screens):** `AppNav` in `(app)` layout only —
«Проекты»; under a project path «Исследование» (redirects home), «Задачи»,
«Развёртывания»; Pro adds «Редактор», «Модели». Deep links to standalone routes.
Not shown on the full-bleed shell pages.

### Modals

- Confirm deletion of a project/file/task.
- Create a new project.

### Notifications

- Toast notifications in the top right corner: success (green), error (red), warning (yellow).
- Long operations (specification generation, planning, deploy) show progress as a header indicator or a toast.

### Theme

- Light theme by default, minimalist design, accent color blue (#2563EB).
- Font: Inter (system).

### Implementation pointers

Where the styling mandate above lives in code:

- **Design tokens** — `packages/ui/src/styles/theme.css` (a single Tailwind v4
  `@theme` block; no `tailwind.config.js`). Semantic `--color-*` tokens
  (`--color-fg`, `--color-fg-muted`, `--color-border`, `--color-surface`,
  `--color-primary`, …) surface as the Tailwind utilities the app leans on
  (`text-fg-muted`, `border-border`, `bg-surface`, …).
- **Shared primitives** — `packages/ui` (`@aiflow/ui`): `Button`, `Input` +
  `Field`, `Card` + `CardTitle`/`CardDescription`, `Spinner`, `cn`.
- **App composition** — `apps/web/src/shared/ui`: `AppHeader`, `AppNav`
  (horizontal nav for `(app)` layout only), `LocalDateTime`.
- **Project shell** — `apps/web/src/app/(shell)/projects/[id]/_shell/`:
  `ProjectShell`, `SidebarNav`, `ProjectRoutes` (`buildProjectRoutes`).
- **Chat surface** — `features/chat/ui/agui/` (`AguiChatPanel` patterns,
  `AguiThreadList`, custom message renderers, `llm.ts`, `storage.ts`).

Not yet shared primitives (inline per feature until a second consumer appears):
the editor runs its own `DialogHost` and an inline toast strip; there is no
shared Modal/Toast/Tabs/Timeline. A file tree exists only inside the editor
feature (`features/editor`), not in `packages/ui`.

## 10. Responsiveness (MVP)

- Below 768px width the side panels collapse behind a hamburger menu.
- Chat and editor take 100% width.

## 11. User Flows (brief)

### Customer flow (Aunt Zina)

1. Login → Projects → Create project → **project home** (chat shell).
2. Chat with Analyst → generate SPEC (tool/starter) → review SPEC Route or artifact → Approve.
3. Open **Tasks** (sidebar or `/tasks`) → watch plan/code progress.
4. After deploy → **Deploy** panel or `/deployments` → open application URL.

### Engineer flow (Uncle Vasya)

1. Login → Projects → create or open a project (home shell).
2. Chat + **Files** panel: upload/index documents; approve SPEC.
3. **Tasks** panel: enqueue plan (Pro), run/confirm coder tasks, read logs.
4. **Editor** page: manual fixes, commits (separate from shell).
5. **Models** panel: Analyst ModelConfig (Pro).
6. **Deploy** panel: build, read logs. (Agents screen — MVP-2.)
