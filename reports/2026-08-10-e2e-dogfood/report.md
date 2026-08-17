# AI Studio E2E dogfood report — 2026-08-10

**Target:** `http://localhost:3000`  
**Tool:** agent-browser (session `aiflow-e2e`)  
**Test cases:** [../2026-08-10-e2e-testcases.md](../2026-08-10-e2e-testcases.md)  
**Screenshots:** `screenshots/`  
**Environment:** `docker compose down -v` → fresh Postgres/Gitea/MinIO; seeded `dev@example.com` (PRO) and `customer@example.com` (BASIC)

## Summary

| Status           | Count |
| ---------------- | ----: |
| pass             |    18 |
| fail             |     3 |
| blocked          |     2 |
| skipped / manual |   12+ |

**Verdict:** Core auth, project create (after Gitea bootstrap), Analyst chat, SPEC generation, plan enqueue, Pro editor/models pages, and BASIC gates work. **Shell sidebar route panels do not swap the main view** (Critical). Approve button not reachable in UI (Major). Infra: app Docker healthcheck fails because Next binds to container `HOSTNAME` IP, not `127.0.0.1`.

---

## Results by TC-ID

| ID  | Result      | Evidence / notes                                                                                                                                               |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **pass**    | Wrong password → «Неверная почта или пароль»; `A1-wrong-password.png`                                                                                          |
| A2  | **pass**    | Login → `/projects`; `A2-login-projects.png`                                                                                                                   |
| A3  | **pass**    | «Выйти» present on app layout; after session end `/projects` → `/signin`; `A3-logout-final.png` / `A4-unauth-final.png`                                        |
| A4  | **pass**    | Unauthenticated `/projects` → `/signin`                                                                                                                        |
| B1  | **pass**    | Empty list + «Создать первый проект →»                                                                                                                         |
| B2  | **pass**    | Created `E2E Shop` → `/projects/{id}`; Gitea user+token required after volume wipe (see Findings)                                                              |
| B2a | **skipped** | HTML5 `required` on name; not separately exercised                                                                                                             |
| B3  | **pass**    | Shell with Analyst + Pro sidebar                                                                                                                               |
| B4  | **pass**    | Customer list shows own card; Pro had project after create                                                                                                     |
| B5  | **skipped** | Delete UI not mounted — API only                                                                                                                               |
| C1  | **fail**    | Sidebar item highlights (Файлы/Задачи/…) but main pane stays on chat welcome. Standalone `/tasks`, `/deployments` work. `C1-*.png`, `C1-files-after-click.png` |
| C2  | **blocked** | Depends on C1 route switching                                                                                                                                  |
| C3  | **pass**    | Editor + Models visible for Pro; `/editor` and `/settings/models` load                                                                                         |
| C4  | **pass**    | BASIC sidebar: no Редактор/Модели; `/editor` and `/settings/models` redirect to `/projects`. `C4-*.png`                                                        |
| D1  | **pass**    | Starter created thread «Хочу сделать интернет-магазин»; `D1-starter.png`                                                                                       |
| D2  | **pass**    | Assistant reply streamed (clarifying questions); worker `chat-run` 200; `D2-chat-reply.png`                                                                    |
| D3  | **pass**    | Thread menu: Переименовать / Ответвить / Удалить visible                                                                                                       |
| D4  | **pass**    | Редактировать / Удалить on user message visible after SPEC turn                                                                                                |
| D5  | **pass**    | Копировать / Сгенерировать заново on assistant message                                                                                                         |
| E1  | **pass**    | Upload via in-page `fetch`+FormData → `201` `e2e-note.md` (UI panel blocked by C1)                                                                             |
| E2  | **skipped** | Not run                                                                                                                                                        |
| E3  | **skipped** | Index not run (embeddings / UI panel)                                                                                                                          |
| F1  | **pass**    | `spec:generate` → artifact SPEC.md v1; `F1-spec-artifact.png`                                                                                                  |
| F2  | **fail**    | «Утвердить» not found in a11y tree / open artifact detail. Approved via `POST …/specifications/1/approve` → 200 for G5                                         |
| F3  | **blocked** | Spec shell route broken by C1; content visible in chat markdown                                                                                                |
| G1  | **pass**    | «Сгенерировать план» on Pro `/tasks`                                                                                                                           |
| G2  | **pass**    | Empty copy before plan                                                                                                                                         |
| G3  | **pass**    | Deployments page loads; Pro «Собрать сейчас»                                                                                                                   |
| G4  | **manual**  | Build not executed end-to-end                                                                                                                                  |
| G5  | **pass**    | Plan queued → 15 tasks with Dry-run/Запустить; `G5-tasks-after-plan.png`                                                                                       |
| H1  | **pass**    | Monaco shell, README.md, Save/Build/Git; `H1-editor.png`                                                                                                       |
| H2  | **blocked** | Opened README; Save stayed disabled (no edit in Monaco via a11y)                                                                                               |
| H3  | **pass**    | Model form: provider/model/base URL/key; `H3-models.png`                                                                                                       |
| I1  | **pass**    | Customer → Pro project URL → Next.js **404** (no data leak); URL stays on foreign id                                                                           |
| I2  | **pass**    | BASIC `/tasks` without plan button; `/deployments` without «Собрать сейчас»                                                                                    |

---

## Findings

### F-1 — Critical: Shell sidebar routes do not replace main content

- **Repro:** Open `/projects/{id}` as Pro → click «Файлы» / «Задачи» / «Развёртывания» / «Спецификация».
- **Observed:** Item gets selected background; main area still shows Analyst welcome / chat. Screenshots `C1-files.png`, `C1-tasks.png`, `C1-files-after-click.png`.
- **Workaround:** Use standalone pages `/projects/{id}/tasks`, `/deployments` (work). Editor is already a separate page.
- **Likely area:** Controlled `path`/`onNavigate` on `AgentInterface` in [`ProjectShell.tsx`](<../apps/web/src/app/(shell)/projects/[id]/_shell/ProjectShell.tsx>) + `AgentInterface.Route` in [`ProjectRoutes.tsx`](<../apps/web/src/app/(shell)/projects/[id]/_shell/ProjectRoutes.tsx>) / OpenUI version mismatch.
- **Console:** `Module not found: Can't resolve 'ai'` from `@openuidev/react-headless` (may be related).

### F-2 — Major: SPEC Approve button not reachable in UI

- **Repro:** Generate SPEC → open artifact card / workspace «SPEC.md · v1».
- **Observed:** Markdown appears in chat; no «Утвердить» in accessibility tree. `actual` renderer in `spec-artifact-renderer.tsx` should show it in the detail panel.
- **Workaround:** `POST /api/projects/{id}/specifications/{v}/approve` (used successfully for plan).

### F-3 — Major: Fresh Gitea volume has no admin user/token

- After `docker compose down -v`, create project returned **502**; Gitea log: `POST …/admin/users/aistudio/repos` → **401**.
- **Fix applied for this run:** `gitea admin user create --admin --username aistudio …` and new access token written to `.env` `GITEA_ADMIN_TOKEN`, then recreate `app`/`worker`.
- Document as required post-wipe step (or automate in compose init).

### F-4 — Major: App container healthcheck always fails

- Next listens on container IP from Docker `HOSTNAME` (`server.ts`: `process.env.HOSTNAME ?? '0.0.0.0'`), not `127.0.0.1`.
- Host `http://localhost:3000/api/health` → `{"ok":true}`; in-container healthcheck → ECONNREFUSED.
- Blocks `registry-proxy` `depends_on: app healthy` (started with `--no-deps`).

### F-5 — Minor / UX

- Chat composer placeholder **English** («Type your query here») while UI is Russian.
- SPEC job title mixed Chinese: «Обновление库存».
- Create project can take **30–40s** (schema + Gitea); button stays «Создание…» with little feedback.
- I1: foreign project shows 404 body but URL remains `/projects/{foreignId}` (acceptable; no leak).
- ProMode redirect for editor/models goes to `/projects`, not `/` (docs said `/`).

### F-6 — UX / product gaps (known)

- No delete-project UI wired.
- No uiMode toggle in UI.
- No sign-up screen (seed only).

---

## Manual checklist (please run yourself)

1. **Shell routes F-1:** After a fix, verify Files upload UI, Spec panel, Models panel inside shell (not only standalone URLs).
2. **Approve UI F-2:** Open artifact detail → «Утвердить» → badge «✓ Утверждена».
3. **Full Analyst interview:** Multi-turn answers until SPEC quality is acceptable (we used a short smoke).
4. **Coder sandbox:** On a task → Dry-run → Confirm/Запустить → wait for sandbox lint/tsc → commit in Gitea. Needs `aistudio/aider-sandbox` image + API key secret.
5. **Deploy build:** «Собрать сейчас» / editor «Сборка» → log stream → success/fail.
6. **File index + RAG:** Upload PDF/txt in Files UI → Индексировать → ask chat a question that needs the file.
7. **Editor save:** Edit in Monaco → Сохранить → reload content from Gitea.
8. **Delete project:** When UI exists, or `DELETE /api/projects/{id}` + confirm soft-delete + list.
9. **BASIC chat tools:** Customer message that triggers Pro-only tools → «Требуется Pro».
10. **Mobile &lt;768px:** Sidebar collapse / hamburger.
11. **WebSocket sandbox logs** during code-execute.
12. **Post-wipe Gitea bootstrap** automation / docs for teammates.
13. **Healthcheck / HOSTNAME** fix so `docker compose up` marks app healthy.

---

## Prep notes for next clean run

```bash
docker compose down -v
docker compose up -d
# wait until postgres+gitea healthy; app may be "unhealthy" until F-4 fixed
docker compose exec -u git gitea gitea admin user create --admin --username aistudio \
  --password '…' --email aistudio@example.com --must-change-password=false
docker compose exec -u git gitea gitea admin user generate-access-token \
  --username aistudio --token-name aiflow --scopes all
# put token into .env GITEA_ADMIN_TOKEN; recreate app worker
docker compose exec app sh -c '/workspace/node_modules/.bin/tsx /workspace/packages/db/scripts/seed-dev-user.ts'
docker compose exec app sh -c '/workspace/node_modules/.bin/tsx /workspace/packages/db/scripts/seed-dev-user.ts customer@example.com devpassword'
# SET uiMode BASIC for customer via psql
```

**Accounts used:** `dev@example.com` / `devpassword` (PRO); `customer@example.com` / `devpassword` (BASIC).

**Projects:** Pro `68830f3d-b580-4c7c-aad1-7e5cceaed848` (E2E Shop); Customer `06135309-f9fd-46ab-9d22-50d990f6811d` (Customer Project).
