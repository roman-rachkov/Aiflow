# AI Studio — E2E test cases (2026-08-10)

Base URL: `http://localhost:3000`

**Accounts (after clean seed):**

| Role | Email | Password | uiMode |
|------|-------|----------|--------|
| Pro (Engineer) | `dev@example.com` | `devpassword` | PRO |
| Customer | `customer@example.com` | `devpassword` | BASIC |

**Priorities:** P0 blocker · P1 core path · P2 important · P3 edge

**Statuses (filled in dogfood report):** pass / fail / blocked / skipped / manual

---

## Suite A — Auth

### A1 — Wrong password
- **Priority:** P0
- **Preconditions:** Seeded Pro user exists
- **Steps:**
  1. Open `/signin`
  2. Enter `dev@example.com` / wrong password
  3. Click «Войти»
- **Expected:** Stay on `/signin`; alert «Неверная почта или пароль»; no session cookie for app routes

### A2 — Successful Pro login
- **Priority:** P0
- **Steps:**
  1. Open `/signin`
  2. Enter `dev@example.com` / `devpassword`
  3. Click «Войти»
- **Expected:** Redirect to `/` → `/projects`; project list (or empty state) visible; UserBadge shows user

### A3 — Logout
- **Priority:** P1
- **Preconditions:** Logged in on `/projects` (app layout with header)
- **Steps:**
  1. Open UserBadge / «Выйти»
- **Expected:** Redirect to `/signin`; `/projects` redirects to `/signin` when unauthenticated

### A4 — Unauthenticated redirect
- **Priority:** P0
- **Preconditions:** Logged out / clean session
- **Steps:**
  1. Open `/projects`
- **Expected:** Redirect to `/signin`

---

## Suite B — Projects CRUD

### B1 — Empty project list
- **Priority:** P1
- **Preconditions:** Clean DB, logged in as Pro
- **Steps:**
  1. Open `/projects`
- **Expected:** Empty copy («Пока нет проектов» or equivalent) + link/card to create

### B2 — Create project (happy path)
- **Priority:** P0
- **Steps:**
  1. Open `/projects/new`
  2. Name: `E2E Shop`; description optional
  3. Submit «Создать проект»
- **Expected:** Land on `/projects/{id}` (via research redirect); shell with Analyst chat; project appears in `/projects`

### B2a — Create validation (empty name)
- **Priority:** P2
- **Steps:**
  1. Open `/projects/new`
  2. Submit without name (or clear required field)
- **Expected:** Browser/HTML5 validation or server «Введите название проекта»; no project created

### B3 — Open project shell
- **Priority:** P0
- **Preconditions:** Project exists
- **Steps:**
  1. From `/projects` click project card
- **Expected:** `/projects/{id}` with chat + sidebar (threads, Files, Tasks, Deploy, Spec, Editor, Models for Pro)

### B4 — Project card on list
- **Priority:** P1
- **Steps:**
  1. After B2, open `/projects`
- **Expected:** Card shows project name; click navigates to shell

### B5 — Delete project (API-only gap)
- **Priority:** P2
- **Note:** `DeleteProjectButton` is not mounted on any page — UI skip
- **Steps (API):**
  1. `DELETE /api/projects/{id}` while authenticated
- **Expected:** 204; project disappears from list (soft-delete)
- **Manual:** Confirm when/if delete UI is wired

---

## Suite C — Project shell navigation

### C1 — Sidebar panels (Pro)
- **Priority:** P0
- **Preconditions:** On `/projects/{id}` as Pro
- **Steps:**
  1. Click «Файлы» → FilePanel
  2. Click «Задачи» → TasksPanel
  3. Click «Развёртывания» → DeploymentsPanel
  4. Click «Спецификация» → SPEC panel
- **Expected:** Each panel renders without crash; content appropriate (empty states OK)

### C2 — Thread switch returns to chat
- **Priority:** P2
- **Steps:**
  1. Open Files panel
  2. Select a thread in sidebar
- **Expected:** Path resets to chat (Files panel closes)

### C3 — Pro sees Editor and Models
- **Priority:** P0
- **Steps:**
  1. On project shell, look for «Редактор» and «Модели»
  2. Open Editor (navigates to `/projects/{id}/editor`)
  3. Open Models panel or `/settings/models`
- **Expected:** Both reachable; editor loads; models form loads

### C4 — BASIC hides Editor/Models + redirect
- **Priority:** P0
- **Preconditions:** Logged in as `customer@example.com` (BASIC), own project
- **Steps:**
  1. Open project shell — Editor/Models absent from sidebar
  2. Navigate to `/projects/{id}/editor`
  3. Navigate to `/projects/{id}/settings/models`
- **Expected:** Sidebar without Editor/Models; direct URLs redirect to `/` (or home)

---

## Suite D — Chat / Analyst

### D1 — Starter prompt
- **Priority:** P1
- **Steps:**
  1. On empty/main thread, click a starter (e.g. «Хочу сделать интернет-магазин»)
- **Expected:** Starter fills/sends into composer or starts a turn

### D2 — Send message + stream (smoke LLM)
- **Priority:** P0
- **Steps:**
  1. Type a short idea: «Нужен простой каталог товаров с корзиной»
  2. Send
- **Expected:** User message appears; assistant streams reply (or clear error if LLM down — then **blocked**)

### D3 — Thread rename / fork / delete
- **Priority:** P2
- **Steps:**
  1. Open thread menu
  2. Rename thread
  3. Fork thread
  4. Delete a non-main thread if allowed
- **Expected:** Actions succeed; UI updates; no console crash

### D4 — Edit / delete user message
- **Priority:** P2
- **Steps:**
  1. On a user message, edit then save; or delete
- **Expected:** Persistence via messages API; UI reflects change

### D5 — Assistant copy / regenerate
- **Priority:** P3
- **Steps:**
  1. On assistant message: copy; regenerate if available
- **Expected:** Copy works; regenerate triggers new run (needs LLM)

---

## Suite E — Files / RAG upload

### E1 — Upload text/markdown
- **Priority:** P1
- **Steps:**
  1. Open Files panel
  2. Upload a small `.txt` or `.md` file
- **Expected:** File appears in list

### E2 — Reject bad MIME (optional)
- **Priority:** P3
- **Steps:**
  1. Attempt upload of disallowed type (e.g. `.exe` / image if not allowlisted)
- **Expected:** Error; file not indexed as allowed document

### E3 — Index button
- **Priority:** P1
- **Preconditions:** File uploaded
- **Steps:**
  1. Click «Индексировать» on row
- **Expected:** Status progresses / completes (needs embeddings); failure → **blocked** with reason

---

## Suite F — SPEC

### F1 — Smoke generate via chat
- **Priority:** P0
- **Preconditions:** Some chat context (D2)
- **Steps:**
  1. Use welcome/action «Создать спецификацию» or prompt to generate SPEC.md
- **Expected:** Tool `spec:generate` runs; artifact card or version created (LLM/worker required)

### F2 — Approve artifact
- **Priority:** P0
- **Preconditions:** SPEC artifact visible
- **Steps:**
  1. Open artifact detail
  2. Click «Утвердить»
- **Expected:** Approval succeeds; version marked approved

### F3 — Spec panel shows latest
- **Priority:** P1
- **Steps:**
  1. Open «Спецификация» in sidebar
- **Expected:** Latest SPEC markdown (or empty hint if none)

---

## Suite G — Tasks / Deploy (Pro UI)

### G1 — Plan button visible (Pro)
- **Priority:** P1
- **Steps:**
  1. Open Tasks panel as Pro
- **Expected:** «Сгенерировать план» visible

### G2 — Empty state without approved SPEC
- **Priority:** P1
- **Preconditions:** No approved SPEC (or before F2)
- **Steps:**
  1. Open Tasks
- **Expected:** Empty guidance about approving SPEC; plan may fail/gate if clicked early

### G3 — Deployments list
- **Priority:** P1
- **Steps:**
  1. Open Deploy panel / `/deployments`
- **Expected:** List or empty state; no crash

### G4 — «Собрать сейчас» (best-effort)
- **Priority:** P2
- **Steps:**
  1. Click «Собрать сейчас»
- **Expected:** Deployment enqueued; status/log appears — or clear error. Full green build may be **manual**

### G5 — Generate plan after approve (best-effort / manual)
- **Priority:** P1
- **Preconditions:** F2 passed
- **Steps:**
  1. «Сгенерировать план»
- **Expected:** Tasks appear; statuses update. Sandbox execute → **manual** if long

---

## Suite H — Editor / Models (Pro)

### H1 — Open Monaco editor
- **Priority:** P1
- **Steps:**
  1. Open `/projects/{id}/editor`
- **Expected:** File tree + editor load (Gitea provisioned)

### H2 — Save file
- **Priority:** P2
- **Steps:**
  1. Edit a file; «Сохранить»
- **Expected:** Save succeeds; content persists on reload

### H3 — Model config save
- **Priority:** P1
- **Steps:**
  1. Open Models; set provider/model (and optional key)
  2. «Сохранить»
- **Expected:** Success; API key not shown in plaintext on reload (masked / empty)

---

## Suite I — Negative / isolation

### I1 — Foreign projectId
- **Priority:** P1
- **Preconditions:** Customer and Pro each have a project; use Pro project id as Customer
- **Steps:**
  1. As Customer, open `/projects/{proProjectId}`
- **Expected:** 404 / no existence leak / redirect — not the other user's data

### I2 — BASIC gated APIs / UI
- **Priority:** P1
- **Steps:**
  1. As Customer: Tasks — no plan button or plan returns Pro error
  2. Deploy — no «Собрать сейчас» or 403
- **Expected:** Gates enforced in UI and/or API

---

## Out of scope for automated pass (manual checklist)

See dogfood report § Manual. Includes: full Analyst interview quality, sandbox coder loop, WS logs, PDF RAG citation, mobile layout, delete UI, uiMode toggle UI, Agents screen (not shipped).
