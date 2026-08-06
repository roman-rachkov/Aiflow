# Task 2.2 — Code editor and Git integration (MVP-0)

## Goal and context

Эта спецификация описывает только задачу 2.2 из roadmap AI Studio — код-редактор
Monaco с деревом файлов и интеграцию с Git через Gitea HTTP API, в варианте MVP-0.
Задача даёт Инженеру (режим Pro) возможность вручную править код проекта, коммитить
от имени пользователя и просматривать историю/diff — без песочниц Aider и без
реальной сборки Docker-образа.

Что входит в объём:

- HTTP-клиент Gitea в `apps/web/src/shared/gitea` (`GITEA_URL`, `GITEA_ADMIN_TOKEN`).
- При создании проекта: создание репозитория в Gitea; сохранение идентичности репо на
  `ProjectMeta` (новые поля); расширение compensation saga создания проекта.
- Экран `/projects/[id]/editor` (только Pro через `requireProMode`): дерево файлов из
  Gitea, Monaco, вкладки, Save → commit, панель истории Git + diff.
- REST API: дерево, содержимое файла, commit, история, diff.
- WebSocket для стриминга состояния редактора/файлов (обязателен по roadmap).
- Нижняя панель «терминал» — UI-заглушка на том же WS-канале (команды — вне объёма).
- Кнопка «Сборка» — навигация/заглушка к деплою; реальный dockerode — Task 2.3.

Что НЕ входит:

- Task 2.3: ModelConfig, dockerode build, экспорт Dockerfile / docker-compose.
- MVP-1: песочницы, Aider, предупреждение о конфликте с активной задачей Coder.
- Сравнение версий SPEC.md.
- Очереди BullMQ / worker — для 2.2 не нужны.

Для кого: аутентифицированный владелец проекта в режиме UI `PRO` (Инженер). Режим
`BASIC` (Заказчик) экран редактора не видит и API редактора не вызывает.

## Users and roles

- **Инженер (uiMode = PRO)**: владелец проекта; открывает редактор, правит файлы,
  коммитит, смотрит историю и diff. Доступ через `requireUser` + `requireProMode` +
  `canAccessProject` / `resolveProjectSchema`.
- **Заказчик (uiMode = BASIC)**: редактор скрыт в меню; запросы к editor API и WS
  получают 403.

Роли `ADMIN` / `OWNER` в MVP-0 не задействованы отдельно от владения проектом.

## Functional requirements

### Screen/Page "Code Editor"

- **URL**: `/projects/[id]/editor`
- **Available to roles**: только Pro (`requireProMode`); владелец проекта.
- **Purpose**: ручное редактирование кода проекта, просмотр Git-истории и diff.
- **Interface elements**:
  - **List** «Дерево файлов» (левая панель): иерархия из Gitea Contents API; иконки
    по расширению; клик по файлу открывает его во вкладке редактора.
  - **Context menu** на узле дерева: «Создать файл», «Создать папку», «Переименовать»,
    «Удалить» (с подтверждением Modal). Операции через Gitea Contents API (create /
    update / delete = commit).
  - **Tabs** открытых файлов (центр сверху): имя файла; индикатор «изменён» (dirty);
    закрытие вкладки (с подтверждением при dirty).
  - **Monaco Editor** (центр): подсветка синтаксиса по расширению; Ctrl+S / кнопка
    «Сохранить» → commit от имени пользователя.
  - **Button** «Сохранить»: активна при dirty; вызывает commit API.
  - **Button** «Сборка»: заглушка — переход на `/projects/[id]/deployments` или toast
    «Сборка будет доступна в следующем этапе»; без вызова dockerode.
  - **Drawer / Panel** «Git» (правая, переключаемая): список коммитов; клик → diff
    выбранного коммита (unified или side-by-side в Monaco DiffEditor).
  - **Panel** «Терминал» (низ, сворачиваемая): UI-заглушка; подключается к тому же
    WebSocket; в 2.2 только плейсхолдер «Терминал будет доступен позже» и приём
    сообщений типа `terminal.output` (без отправки команд).
  - **Toast**: успех/ошибка сохранения, ошибки Gitea, потеря WS.
- **States**:
  - **loading**: скелетон/Spinner дерева и редактора при первой загрузке.
  - **empty**: репозиторий без файлов (кроме README) — пустое дерево + подсказка
    «Создайте файл».
  - **error**: недоступен Gitea / нет полей репо на ProjectMeta — сообщение и кнопка
    «Повторить».
  - **dirty**: файл изменён локально, в дереве и вкладке метка «•».
  - **saving**: кнопка «Сохранить» disabled, индикатор на вкладке.
- **Logic**:
  1. Страница: server — `requireUser` + `requireProMode` + доступ к проекту; client —
     загрузка дерева через REST, подключение WS.
  2. Открытие файла → `GET .../files?path=` → содержимое в Monaco; событие WS
     `editor.fileOpened`.
  3. Правка → локальный dirty; WS `editor.dirty`.
  4. Save → `POST .../commit` с содержимым открытых dirty-файлов (минимум текущего);
     после успеха — сброс dirty, обновление дерева/истории; WS `editor.saved`.
  5. Выбор коммита в истории → `GET .../diff?sha=` → DiffEditor.
- **Scope**: mvp-0.

### API: дерево файлов

- **Endpoint**: `GET /api/projects/[id]/editor/tree`
- **Available to roles**: Pro + владелец.
- **Query**: опционально `ref` (ветка/SHA; по умолчанию `main`), `path` (поддерево;
  по умолчанию корень).
- **Response**: `200` JSON-массив узлов
  `[{ path, name, type: 'file' | 'dir', size? }]`, отсортированный: сначала dir,
  затем file, по имени.
- **Logic**: `requireUser` → `requireProMode` → доступ к проекту → чтение
  `giteaOwner`/`giteaRepo` с ProjectMeta → Gitea Contents API (рекурсивно или
  по уровню — реализация: один запрос Get Tree recursive при поддержке, иначе
  обход Contents).
- **Errors**: 403 (не Pro / не владелец), 404 (проект / нет gitea-полей), 502
  (Gitea недоступен).
- **Scope**: mvp-0.

### API: содержимое файла

- **Endpoint**: `GET /api/projects/[id]/editor/file`
- **Query**: обязательный `path`, опционально `ref` (по умолчанию `main`).
- **Response**: `200` `{ path, content, encoding: 'utf-8', sha, size }` — `sha` blob
  из Gitea для последующего update с проверкой.
- **Logic**: Gitea Get File Contents; декодирование base64 → utf-8. Бинарные файлы
  в MVP-0 не редактируются: ответ `415` с сообщением «Бинарный файл нельзя открыть
  в редакторе».
- **Errors**: 404 (файл не найден), 415 (бинарный), 403/502 как выше.
- **Scope**: mvp-0.

### API: commit (сохранение)

- **Endpoint**: `POST /api/projects/[id]/editor/commit`
- **Available to roles**: Pro + владелец.
- **Request body**:
  ```json
  {
    "message": "string (optional)",
    "branch": "main",
    "files": [{ "path": "src/app.ts", "content": "...", "sha": "optional-blob-sha" }]
  }
  ```
  Если `message` пуст — шаблон: `Update {paths} via AI Studio`.
- **Response**: `200` `{ commitSha, branch, files: string[] }`.
- **Logic**:
  1. Guards как выше; загрузить `giteaOwner`/`giteaRepo` и пользователя сессии
     (name, email).
  2. Для каждого файла — Gitea Create/Update File Contents с `author`/`committer` =
     данные текущего пользователя (не admin identity в метаданных коммита); токен —
     admin.
  3. Несколько файлов в одном запросе — последовательные API-вызовы на одной ветке
     (атомарный multi-file commit через Git Trees API допустим как оптимизация;
     минимум — пофайловые commits с общим префиксом сообщения, предпочтительно
     один commit через Trees API).
- **Errors**: 400 (пустой `files`), 409 (конфликт SHA — файл изменился на сервере),
  502 (Gitea).
- **Scope**: mvp-0.

### API: создание / удаление / переименование пути

- **Endpoint (create)**: `POST /api/projects/[id]/editor/files`
  - Body: `{ path, content?, isDir? }` — для папки создаётся `.gitkeep` с пустым
    содержимым (Gitea не хранит пустые dirs).
- **Endpoint (delete)**: `DELETE /api/projects/[id]/editor/files`
  - Query/body: `path`, `sha` (обязателен для файла).
- **Endpoint (rename)**: `POST /api/projects/[id]/editor/files/rename`
  - Body: `{ fromPath, toPath, sha }` — delete+create в одном логическом commit
    (или два коммита с связанными сообщениями; предпочтительно один Trees commit).
- **Response**: `200` с `{ commitSha, path }`.
- **Scope**: mvp-0.

### API: история коммитов

- **Endpoint**: `GET /api/projects/[id]/editor/commits`
- **Query**: `ref` (default `main`), `page` (default 1), `limit` (default 20, max 50).
- **Response**: `200`
  `[{ sha, shortSha, message, authorName, authorEmail, committedAt, url? }]`.
- **Logic**: Gitea List Repo Commits.
- **Scope**: mvp-0.

### API: diff коммита

- **Endpoint**: `GET /api/projects/[id]/editor/diff`
- **Query**: обязательный `sha` (commit), опционально `path` (фильтр одного файла).
- **Response**: `200`
  `{ sha, files: [{ path, status: 'added'|'modified'|'deleted'|'renamed', patch, oldPath? }] }`.
- **Logic**: Gitea Get Single Commit / Compare; отдать unified patches для UI.
- **Scope**: mvp-0.

### API: создание проекта (расширение saga)

- **Endpoint**: существующий `POST /api/projects` (без смены контракта ответа для
  клиента; gitea-поля в публичный `ProjectView` не обязаны попадать).
- **Logic (saga)**:
  1. `createProjectSchema(schemaName)`.
  2. Создать репозиторий Gitea: имя `project-{uuidWithoutHyphens}` (или короткий id),
     private, default branch `main`; начальный commit с `README.md` (имя проекта +
     одна строка-заглушка), чтобы Contents/Tree API работали сразу.
  3. `projectMeta.create` с `giteaOwner`, `giteaRepo` (и при необходимости
     `giteaDefaultBranch = 'main'`).
  4. **Compensation**:
     - ошибка после шага 2 (insert meta): удалить Gitea-репо + `dropProjectSchema`;
     - ошибка после шага 1 (Gitea): `dropProjectSchema`;
     - ошибка шага 1: ничего компенсировать.
- **Scope**: mvp-0.

## Background processes

### Job "Editor WebSocket session"

- **Trigger**: клиент редактора открывает соединение
  `WS /api/projects/[id]/editor/ws` (после проверки сессии/Pro/доступа; токен сессии
  через cookie того же origin или короткий ticket query — на усмотрение реализации,
  cookie предпочтительнее).
- **Steps**:
  1. Upgrade HTTP → WebSocket; привязать соединение к `projectId` + `userId`.
  2. Принимать и рассылать события состояния редактора (тот же пользователь /
     тот же проект; fan-out на другие вкладки того же пользователя — желательно;
     multi-user collaboration — **вне объёма**).
  3. Типы сообщений (JSON):
     - client→server: `editor.subscribe`, `editor.dirty` `{ path }`,
       `editor.cursor` (опционально, можно игнорировать в 2.2),
       `terminal.attach` (no-op ack).
     - server→client: `editor.fileOpened` `{ path }`, `editor.saved` `{ path, commitSha }`,
       `editor.treeChanged`, `editor.error` `{ message }`,
       `terminal.output` `{ chunk }` (в 2.2 не генерируется платформой, канал
       зарезервирован), `terminal.ready` (заглушка один раз при attach).
  4. При закрытии вкладки — cleanup подписки; без персистентности в Redis
     (состояние эфемерно; Redis не является источником истины).
- **Failure handling**: при обрыве клиент переподключается с backoff; REST остаётся
  источником истины для файлов/коммитов. Ошибка auth на handshake → закрытие с кодом 4403.
- **Scope**: mvp-0 (канал обязателен; полезная нагрузка терминала — заглушка).

Очередей BullMQ в Task 2.2 нет. Вызовы Gitea API в route handlers считаются
короткими и допустимыми для Next.js app (инвариант «нет долгой работы» не
нарушается).

## Data entities

Изменения только в `public.ProjectMeta` (`packages/db/prisma/schema.prisma` +
миграция Prisma для public schema):

- **ProjectMeta** (расширение):
  - `giteaOwner String` — владелец/организация в Gitea (для MVP-0 — пользователь
    admin из токена / фиксированный org из env, например `aistudio`).
  - `giteaRepo String` — имя репозитория.
  - `giteaDefaultBranch String @default("main")` — ветка по умолчанию.
  - Уникальность: `@@unique([giteaOwner, giteaRepo])`.
  - Для уже существующих проектов без репо: при первом заходе в editor — ленивое
    создание репо + backfill полей **или** ошибка с подсказкой пересоздать проект.
    Решение MVP-0: **ленивое provision** при `GET tree`, если поля null (один раз,
    под lock в памяти/БД), чтобы не ломать демо-данные Task 1.x/2.1.

Новых project-schema моделей не требуется. Soft-delete: `ProjectMeta.deletedAt`
без изменений; физическое удаление Gitea-репо при soft-delete проекта в 2.2
**не делается** (репо остаётся; согласовано с «схема БД сохраняется для restore»).

## APIs and integrations

### Gitea HTTP API

- Клиент: `apps/web/src/shared/gitea` (публичный surface: `createRepo`, `getTree`,
  `getFile`, `createOrUpdateFile`, `deleteFile`, `listCommits`, `getCommitDiff`,
  `deleteRepo` для compensation).
- Env: `GITEA_URL` (compose: `http://gitea:3000`), `GITEA_ADMIN_TOKEN` (обязателен
  в runtime редактора/create), опционально `GITEA_REPO_OWNER` (default `aistudio` —
  пользователь/org, от имени которого создаются репо; должен существовать в Gitea
  dev-стека или создаваться bootstrap-скриптом — зафиксировать в assumptions).
- Auth: `Authorization: token ${GITEA_ADMIN_TOKEN}`.
- Порты: внутри сети `gitea:3000`; с хоста UI ссылки на ROOT_URL
  `http://localhost:3002/` только для опциональных внешних URL в ответе commits;
  серверные вызовы всегда через `GITEA_URL`.
- Таймаут запросов клиента: разумный короткий (например 15s); ошибки сети → 502.

### WebSocket в Next.js

- Реализация через поддерживаемый в проекте способ upgrade (отдельный лёгкий
  handler на том же процессе app **или** route + `ws`); без отдельного
  долгоживущего worker-процесса. Детали — assumption ниже.
- Не проксирует sandbox (песочниц ещё нет); только сигналы редактора + stub
  terminal.

### UI / FSD

- Feature-слайс `features/editor` (`api`, `ui`, `model`, `index.ts`).
- Расширение `features/projects/model/service.ts` (saga + поля).
- Shared: `shared/gitea`.
- Маршрут страницы: `app/(app)/projects/[id]/editor/page.tsx` — только wiring.
- API routes: `app/api/projects/[id]/editor/...`.
- Примитивы `@aiflow/ui`; светлая тема, Inter; копирайт UI на русском.
- Новый `@source` в `globals.css`, если появятся новые директории с классами.

## AI agents and automation

В Task 2.2 новых AI-агентов нет. Коммиты от имени пользователя — ручные, не
Coder/Aider. Автогенерация кода в песочнице — MVP-1.

## Non-functional requirements

- **Platform**: веб, существующее Next.js App Router приложение AI Studio.
- **Stack**: Next.js 15 App Router, React, Monaco Editor (`@monaco-editor/react` или
  эквивалент с допустимой лицензией §8), Gitea REST API v1, WebSocket, Prisma
  (public schema migration), Tailwind v4 + `@aiflow/ui`.
- **Design**: светлая тема, минимализм, акцент blue (#2563EB), шрифт Inter; UI-тексты
  на русском.
- **Deployment**: без изменений compose-топологии; нужны валидные `GITEA_URL` /
  `GITEA_ADMIN_TOKEN` в `.env` (уже в `.env.example`).
- **Constraints**:
  - FSD: `app/` → `features/` → `shared/` → `packages/`; без логики в `app/`.
  - Auth: `requireUser`, `requireProMode`, проверка владения / `resolveProjectSchema`
    где нужен project client (для editor чаще достаточно ProjectMeta + Gitea).
  - Soft-delete: чтения ProjectMeta с `deletedAt: null`.
  - Файл ≤ 200 строк, функция ≤ 50, complexity ≤ 10.
  - Next.js app не выполняет долгую работу; Gitea round-trips — OK.
  - Лицензии новых deps — gate §8 (`docs/15`); Monaco / `@monaco-editor/react` —
    MIT (проверить LICENSE при добавлении).
- **Testing**: Vitest — unit-тесты Gitea-клиента (mock fetch), saga createProject с
  compensation (mock Gitea + schema), сервисов editor; route handler tests с
  моками guards/Gitea. Без e2e-браузера в обязательном объёме 2.2.
- **Responsiveness**: по `docs/09-ui-spec.md` §10 — на узких экранах боковые панели
  сворачиваются; редактор на всю ширину.

## Assumptions and open questions

Принятые решения (зафиксированы; planner не ставит `needsConfirmation` на них):

1. **Идентичность репо на ProjectMeta**: поля `giteaOwner`, `giteaRepo`,
   `giteaDefaultBranch` (`main`). Имя репо: `project-{uuidWithoutHyphens}`.
2. **Владелец репо в Gitea**: `GITEA_REPO_OWNER` (default `aistudio`) + admin token;
   author/committer коммита — имя и email пользователя сессии.
3. **Compensation saga**: schema → Gitea repo (+ README) → ProjectMeta.create;
   откат в обратном порядке при сбое.
4. **Ленивый backfill** для старых проектов без gitea-полей при первом обращении к
   editor API.
5. **Save = commit** на ветку `main`; без staging area и без feature-branches в 2.2.
6. **WebSocket обязателен**: канал состояния редактора + reserved `terminal.*`;
   команды терминала и sandbox I/O — вне 2.2.
7. **Кнопка «Сборка»** — навигация/toast-заглушка; dockerode — Task 2.3.
8. **Предупреждение о конфликте с активной задачей Coder** — вне 2.2 (нет Coder).
9. **Бинарные файлы** не открываются в Monaco (415).
10. **Один commit на Save** предпочтительно через Git Trees API; допустим fallback
    пофайловых Create File Contents.
11. **Soft-delete проекта не удаляет Gitea-репо** в 2.2.
12. **Очереди не используются**.
13. **Monaco**: зависимость `@monaco-editor/react` (MIT), язык UI — русский.
14. **Пустые папки**: файл `.gitkeep`.
15. **Multi-user live collaboration** (общие курсоры) — вне объёма; WS обслуживает
    состояние одной пользовательской сессии / её вкладок.

Открытые вопросы (решает реализация в рамках ориентиров, без блокировки плана):

16. **Bootstrap пользователя/org `aistudio` в Gitea dev**: если отсутствует в
    compose — добавить одноразовый init в entrypoint/docs или создавать репо под
    admin user из токена (`giteaOwner` = login admin). Предпочтение: owner = admin
    login из API `/user`, без отдельного org, если org усложняет dev.
17. **Точный механизм WS upgrade в Next.js 15** (custom server vs experimental) —
    выбрать рабочий для текущего `apps/web` без ломки `docker compose` bind-mount
    dev; REST остаётся fallback для всех мутаций.
18. **Пакетный commit Trees API vs последовательные Contents** — выбрать по
    простоте клиента; поведение для пользователя одинаково (один логический Save).
