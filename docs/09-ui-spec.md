# AI Studio – User Interface Specification (MVP)

## 1. Overview

AI Studio is a responsive web application built around two roles: Customer (Aunt Zina) and Engineer (Uncle Vasya). The Customer works only with the researcher chat and the project card; the Engineer also has the code editor, model settings, and the task panel.

## 2. Screen Map and Navigation

```

/ (after login) → Dashboard (project list)
/projects/[id] → Project card
/projects/[id]/research → Researcher (chat + SPEC)
/projects/[id]/tasks → Tasks and Roadmap
/projects/[id]/editor → Code editor (Monaco)
/projects/[id]/agents → Project agents
/projects/[id]/deployments → Deployment history
/settings/profile → Profile settings

```

For the Customer the sidebar contains only Dashboard, Researcher, Deployments. The other screens are hidden. The Engineer sees the full menu.

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

## 4. Screen: Researcher (the Customer's main screen)

**URL:** `/projects/[id]/research`
**Purpose:** interview with the AI Analyst, review and approval of the specification.

### Layout

- **Left panel (20% width):** project artifacts:
  - "Specification" (with version).
  - "Uploaded files" (list, deletable).
  - "Roadmap" (link to /tasks).
- **Center (60%):** chat with the Analyst.
  - Message area (dialog history).
  - Each message: avatar (AI/user), text, timestamp.
  - Input field at the bottom, "Send" button.
  - "Create specification" button above the input (generates SPEC.md from the dialog).
- **Right panel (20%):** SPEC.md preview (rendered Markdown). Appears after the specification is generated.
  - "Approve specification" button (becomes disabled after approval; a "Start generation" button appears).

### States

- **Waiting for the Analyst's reply:** "typing..." indicator with animated dots.
- **SPEC generation:** progress bar, message "The Analyst is preparing the specification...".
- **Error:** message "Something went wrong, please try again".

### Customer actions

1. Enters the idea description.
2. Answers clarifying questions.
3. Clicks "Create specification".
4. Reviews SPEC.md in the right panel.
5. Clicks "Approve specification".
6. Clicks "Start generation" → redirected to /tasks with the process running.

### Engineer actions

- Can edit SPEC.md manually ("Edit" button in the right panel, opens Monaco in Markdown mode).
- Can add files via the "Upload" button (left panel).

## 5. Screen: Tasks and Roadmap

**URL:** `/projects/[id]/tasks`
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

**URL:** `/projects/[id]/deployments`
**Purpose:** review deployment statuses and logs.

### Components

- Deployment table: date, status (icon), version (image tag), URL (if deployed).
- Clicking a row opens the full build log.
- "Deploy now" button (starts a new build from the current repository state).

## 9. Shared Elements and States

### Sidebar

- Customer: "My projects", "Researcher", "Deployments" (current project).
- Engineer: adds "Tasks", "Editor", "Agents".

### Modals

- Confirm deletion of a project/file/task.
- Create a new project.

### Notifications

- Toast notifications in the top right corner: success (green), error (red), warning (yellow).
- Long operations (specification generation, planning, deploy) show progress as a header indicator or a toast.

### Theme

- Light theme by default, minimalist design, accent color blue (#2563EB).
- Font: Inter (system).

## 10. Responsiveness (MVP)

- Below 768px width the side panels collapse behind a hamburger menu.
- Chat and editor take 100% width.

## 11. User Flows (brief)

### Customer flow (Aunt Zina)

1. Login → Dashboard → Create project → Researcher.
2. Describe the idea in chat → Create specification → Review SPEC → Approve → Start generation.
3. Automatic redirect to /tasks → watch progress.
4. After deploy → go to /deployments → open the application by URL.

### Engineer flow (Uncle Vasya)

1. Login → Dashboard → create or open a project.
2. Researcher: upload files, dialog, approve SPEC.
3. Run the planner manually (or automatically), review tasks.
4. If needed: code editor, manual fixes, commits.
5. Configure agents.
6. Start the deploy, check logs.
