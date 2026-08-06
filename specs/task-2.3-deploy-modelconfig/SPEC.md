# Task 2.3 — Manual deploy and ModelConfig (MVP-0)

## Goal and context

Эта спецификация описывает только задачу 2.3 из roadmap AI Studio — ручной деплой
пользовательского проекта (экспорт Docker-артефактов + сборка образа через worker)
и настройку ModelConfig для роли Analyst, с реальным шифрованием секретов в
`packages/crypto`.

Задача закрывает критерий выхода MVP-0: Инженер открывает редактор, правит код,
коммитит и нажимает «Сборка» — получает готовый Docker-образ (статус и лог в UI).
Также даёт возможность задать provider/model и API-ключ Analyst на уровне проекта;
чат читает ModelConfig с откатом на env.

Что входит в объём:

1. **`packages/crypto`** — AES-256-GCM encrypt/decrypt под `ENCRYPTION_KEY`
   (ровно 32 байта); конверт хранения `{"__encrypted__":"<base64>"}`.
2. **ModelConfig** — UI + API (роль Analyst: provider, model, API key); запись
   только в зашифрованном виде; chat / specifications route читают ModelConfig
   с fallback на `createProviderFromEnv` / env.
3. **API экспорта** Dockerfile + `docker-compose.yml` из шаблонов для репозитория
   пользовательского проекта (и опционально запись в Gitea).
4. **Кнопка «Сборка»** → enqueue `deploy:run` (Next.js **не** вызывает dockerode);
   тонкий consumer в `apps/worker` на dockerode; запись `Deployment` +
   `DeploymentMeta`; UI статусов на `/projects/[id]/deployments`.
5. **Open question #4** (`docker.sock`): зафиксировать как **только для dev**;
   prod-вариант отложен — без изобретения Vault / Swarm secrets в этом таске.

Что НЕ входит:

- MVP-1: песочницы Aider, `code:execute`, автоматизация Planner/Coder queues
  сверх consumer `deploy:run`.
- Support Bot / embedded agents / Traefik production-домены (test URL —
  stub/local).
- Шифрование ключей для передачи в sandbox (open question #5) — вне 2.3.
- Реализация `spec:generate` / `plan:generate` / `code:execute` workers.
- Полный model-router decrypt path (crypto пакет должен быть пригоден для
  будущего consumer в `services/model-router`, но wiring router — не обязателен
  в 2.3, если chat идёт через `@aiflow/ai-roles` напрямую).

Для кого: аутентифицированный владелец проекта. ModelConfig и кнопка «Сборка» /
экспорт Docker — режим Pro (Инженер). История деплоев видна и Заказчику
(BASIC), согласно `docs/09-ui-spec.md` (меню Deployments).

## Users and roles

- **Инженер (uiMode = PRO)**: настраивает ModelConfig Analyst; экспортирует
  Dockerfile/compose; запускает сборку из редактора или с экрана deployments;
  смотрит логи и статусы.
- **Заказчик (uiMode = BASIC)**: видит список деплоев и статус/URL (если есть);
  не видит ModelConfig и не запускает сборку (API → 403).

Роли `ADMIN` / `OWNER` в MVP-0 не задействованы отдельно от владения проектом.

## Functional requirements

### Screen/Page "Model settings (Analyst)"

- **URL**: `/projects/[id]/settings/models`
- **Available to roles**: только Pro; владелец проекта.
- **Purpose**: выбрать провайдера и модель Analyst и сохранить API-ключ проекта
  (вместо/поверх env fallback).
- **Interface elements**:
  - **Heading** «Модель Analyst».
  - **Select** «Провайдер»: значения MVP — `openai` (OpenAI-compatible),
    `routerai` (тот же OpenAI-compatible клиент, другой base URL по умолчанию).
    Список расширяем позже; UI не хардкодит десятки провайдеров.
  - **Input** «Модель»: свободный текст (например `gpt-4o`, `glm-4-flash`).
  - **Input** «Base URL» (опционально): переопределение endpoint
    OpenAI-compatible API; плейсхолдер из env/`OPENAI_BASE_URL`.
  - **Input** type=password «API-ключ»: при уже сохранённом ключе — пустое поле
    - подсказка «Ключ сохранён (••••)»; оставить пустым = не менять ключ;
      отдельная **Button** «Удалить ключ» сбрасывает ключ проекта (дальше fallback
      на env).
  - **Button** «Сохранить».
  - **Text** статус: «Используется конфигурация проекта» / «Ключ проекта не
    задан — используется окружение сервера» / ошибка валидации.
  - **Toast**: успех/ошибка сохранения.
- **States**:
  - **loading**: Spinner при загрузке GET.
  - **empty**: нет строки ModelConfig — форма с дефолтами (model/provider из
    env-подсказок), ключ не задан.
  - **error**: 403/404/500 — сообщение на русском + «Повторить».
  - **saving**: кнопка disabled.
- **Logic**:
  1. Server page: `requireUser` + `requireProMode` + доступ к проекту.
  2. Client: `GET .../model-config` → заполнение формы (без plaintext ключа).
  3. Save → `PUT .../model-config`; на сервере encrypt ключа через
     `@aiflow/crypto`, upsert `ModelConfig` в project schema (`deletedAt: null`).
  4. Пункт меню SideMenu (Pro): «Настройки модели» → этот URL.
- **Scope**: mvp-0.

### Screen/Page "Deployment history"

- **URL**: `/projects/[id]/deployments`
- **Available to roles**: владелец проекта (BASIC и PRO). Запуск сборки —
  только Pro.
- **Purpose**: статусы сборок, лог, stub URL; запуск новой сборки (Pro).
- **Interface elements**:
  - **Table** / **List** деплоев: дата (`createdAt`), статус (иконка:
    жёлтый BUILDING, зелёный DEPLOYED, красный FAILED), `imageTag`, `url`
    (если есть; иначе «—»).
  - **Button** «Собрать сейчас» (Pro): создаёт деплой и ставит job в очередь.
  - Клик по строке → **Drawer** / разворот: полный `log` (моноширинный текст),
    `completedAt`, ошибки.
  - **Toast** / индикатор: «Сборка поставлена в очередь».
  - Polling или лёгкий refetch (интервал ~3–5 с, пока есть BUILDING) — WebSocket
    для деплоя **не обязателен** в 2.3.
- **States**:
  - **loading** / **empty** («Ещё не было сборок») / **error**.
  - Строка BUILDING: disabled повторного «Собрать» **или** разрешить параллель
    с предупреждением — MVP: **запрет второй BUILDING** на проект (409).
- **Logic**:
  1. Список: `Deployment` из project schema + сводка уже в `DeploymentMeta`
     (для dashboard badge — читать Meta из public).
  2. «Собрать» → `POST .../deployments` → 202 + id.
  3. Редактор (Task 2.2): кнопка «Сборка» перестаёт быть заглушкой — вызывает
     тот же `POST` или навигает на deployments с автостартом; предпочтение:
     **тот же POST**, затем переход на `/deployments` с подсветкой новой строки.
- **Scope**: mvp-0.

### API: ModelConfig get

- **Endpoint**: `GET /api/projects/[id]/model-config`
- **Available to roles**: Pro + владелец.
- **Response**: `200`
  ```json
  {
    "analyst": {
      "provider": "openai",
      "model": "gpt-4o",
      "baseURL": "https://...",
      "hasApiKey": true
    },
    "source": "project" | "env"
  }
  ```
  Plaintext API-ключ **никогда** не возвращается.
- **Logic**: найти `ModelConfig` (`deletedAt: null`); decrypt; отдать публичные
  поля. Если записи нет / decrypt fail → `source: "env"` и подсказки из
  `readProviderConfigFromEnv()` (без ключа).
- **Errors**: 403, 404 (проект), 500.
- **Scope**: mvp-0.

### API: ModelConfig upsert

- **Endpoint**: `PUT /api/projects/[id]/model-config`
- **Body**:
  ```json
  {
    "analyst": {
      "provider": "openai",
      "model": "gpt-4o",
      "baseURL": "optional-string-or-null",
      "apiKey": "optional-plaintext-or-null"
    }
  }
  ```
  - `apiKey` omitted/null/"" → сохранить прежний ключ (если был).
  - `apiKey: ""` с флагом `"clearApiKey": true` → удалить ключ проекта.
- **Response**: `200` — тот же shape, что GET (без ключа).
- **Logic**: validate provider/model non-empty; encrypt apiKey (если передан);
  сериализовать логический JSON → encrypt **весь** blob колонки `config` как
  `{"__encrypted__":"<base64>"}` через `@aiflow/crypto` + `asEncryptedValue`;
  upsert по `projectId`. Soft-delete: не физический delete; clear = перезапись
  без ключа или soft-delete + recreate — MVP: **перезапись** без ключа.
- **Errors**: 400 (валидация), 403, 404, 500 (нет/`ENCRYPTION_KEY` не 32 байта).
- **Scope**: mvp-0.

### API: экспорт Docker-артефактов

- **Endpoint**: `POST /api/projects/[id]/deploy/export`
- **Available to roles**: Pro + владелец.
- **Body** (опционально): `{ "commitToGitea": true | false }` — default `true`.
- **Response**: `200`
  ```json
  {
    "dockerfile": "<text>",
    "compose": "<text>",
    "committed": true,
    "commitSha": "abc..."
  }
  ```
  Если `commitToGitea: false` — только тексты, без записи в Git.
- **Logic**:
  1. Считать шаблоны из `apps/web` (или `packages/` shared templates) —
     параметризация: имя образа `aistudio-project-{shortId}`, порт 3000,
     Node 22.
  2. Подставить переменные проекта (`giteaRepo`, id).
  3. При commit: Gitea Contents/Trees — файлы `Dockerfile` и
     `docker-compose.yml` в корне репо (ветка default), сообщение коммита
     «chore: add deploy templates (AI Studio)».
- **Errors**: 403, 404 (нет gitea-полей → подсказка открыть editor для
  provision), 502 Gitea.
- **Scope**: mvp-0.

### API: создать деплой / поставить сборку

- **Endpoint**: `POST /api/projects/[id]/deployments`
- **Available to roles**: Pro + владелец.
- **Body** (опционально): `{ "exportFirst": true }` — default `true`: перед
  enqueue вызвать ту же генерацию шаблонов и commit в Gitea, если файлов ещё
  нет или всегда перезаписать шаблоны (MVP: **всегда перезаписать** шаблонные
  файлы перед сборкой, чтобы образ соответствовал платформенным шаблонам).
- **Response**: `202`
  ```json
  { "deploymentId": "uuid", "status": "BUILDING" }
  ```
- **Logic** (всё короткое, в Next.js):
  1. Guard + resolve schema + gitea identity.
  2. Если уже есть `Deployment`/`DeploymentMeta` со статусом `BUILDING` для
     проекта → `409` «Сборка уже выполняется».
  3. Опционально export+commit шаблонов.
  4. Создать `Deployment` (project schema): `status=BUILDING`, `log` начальный.
  5. Создать `DeploymentMeta` (public): тот же смысловой статус, `url=null`.
     Связь id: **одинаковый uuid** для Deployment.id и DeploymentMeta.id
     (удобно для worker) — зафиксировано в assumptions.
  6. `queue.add('deploy:run', payload)` — **без** dockerode в app.
  7. Вернуть 202.
- **Errors**: 403, 404, 409, 502 (Gitea при export), 503 (Redis/queue).
- **Scope**: mvp-0.

### API: список деплоев

- **Endpoint**: `GET /api/projects/[id]/deployments`
- **Available to roles**: владелец (BASIC и PRO).
- **Response**: `200` массив
  `{ id, status, url, imageTag, createdAt, completedAt }[]`
  (без полного log), сортировка `createdAt desc`.
- **Scope**: mvp-0.

### API: детали деплоя (лог)

- **Endpoint**: `GET /api/projects/[id]/deployments/[deploymentId]`
- **Available to roles**: владелец.
- **Response**: `200` полный объект включая `log`.
- **Errors**: 404.
- **Scope**: mvp-0.

### Chat / specifications: чтение ModelConfig

- **Изменение существующих** `POST /api/projects/[id]/chat` и генерации SPEC:
  перед вызовом провайдера резолвить конфиг:
  1. Попытка загрузить + decrypt `ModelConfig` проекта.
  2. Если есть analyst apiKey → `createOpenAICompatibleProvider({ baseURL,
apiKey, chatModel })` и `ChatConfig.model` из ModelConfig.
  3. Иначе — текущий `createProviderFromEnv()` / `readProviderConfigFromEnv()`.
- Embeddings / RAG в 2.3 **могут** остаться на env (ключ Analyst ≠ embedding);
  не блокирует таск. Assumption: embedding по-прежнему из env.
- **Scope**: mvp-0.

## Background processes

### Job "deploy:run"

- **Trigger**: `POST /api/projects/[id]/deployments` ставит job в BullMQ
  очередь `deploy:run` (concurrency 1 на worker-процесс, как в архитектуре).
- **Payload** (typed в `@aiflow/queue`):
  ```ts
  {
    projectId: string;
    deploymentId: string; // = DeploymentMeta.id = Deployment.id
    schemaName: string; // project_{uuid}
    giteaOwner: string;
    giteaRepo: string;
    giteaDefaultBranch: string;
  }
  ```
- **Steps** (worker, dockerode):
  1. Проверить env: в dev допустим Docker via `/var/run/docker.sock` (см. OQ #4).
  2. Подготовить контекст сборки: clone/archive из Gitea в temp dir **или**
     `docker build` с remote context — MVP: **git clone** во временный каталог
     worker (`/tmp/deploy-{deploymentId}`), затем `dockerode.buildImage`.
  3. Тег образа: `aistudio/{giteaRepo}:{shortSha|timestamp}` → записать в
     `Deployment.imageTag`.
  4. Стримить build output в `Deployment.log` (append периодически, не только
     в конце).
  5. MVP runtime: после успешного build — **не** полноценный Traefik publish.
     Опционально `dockerode.createContainer` + start на эфемерном порту host
     **или** только BUILD success без running container. Assumption: **build
     only** → статус `DEPLOYED`, `url` = stub вида
     `local://image/{imageTag}` (или `null` + текст в UI «Образ собран локально»).
     Запуск контейнера — nice-to-have, не блокирует приёмку, если образ есть.
  6. Обновить `Deployment` + `DeploymentMeta`: `DEPLOYED` или `FAILED`,
     `completedAt`, `url`.
  7. Удалить temp dir.
- **Failure handling**:
  - Любая ошибка → `status=FAILED`, stack/message в `log`, Meta синхронно.
  - BullMQ: ограниченные retries (например 1–2) только на инфраструктурные
    сбои Redis/Gitea transient; ошибки build — **без** бесконечного retry
    (attempts: 1 или fail-fast после первой build-ошибки).
  - Next.js **никогда** не вызывает dockerode.
- **Scope**: mvp-0 (consumer только `deploy:run`; остальные очереди могут
  оставаться no-op stubs).

### Package `@aiflow/queue` (реализация stub → real)

- Экспорт: имена очередей, factory connection (Redis URL из env),
  `getDeployQueue()`, типы payload, default job options.
- Очереди объявить все четыре (`spec:generate`, `plan:generate`,
  `code:execute`, `deploy:run`) для совместимости с compose `QUEUES=...`,
  но **обработчик обязателен только для `deploy:run`**.
- **Scope**: mvp-0.

### Package `@aiflow/crypto` (реализация stub → real)

- API:
  - `encrypt(plaintext: string, key?: Buffer): EncryptedEnvelope`
  - `decrypt(envelope: EncryptedEnvelope, key?: Buffer): string`
  - `readEncryptionKey(): Buffer` — из `process.env.ENCRYPTION_KEY`, длина
    **ровно 32** UTF-8 байта (или 64 hex → 32 bytes — выбрать одно;
    assumption: **32 UTF-8 символа**, как в `.env.example` placeholder).
  - Envelope: `{ __encrypted__: string }` где string — Base64 от
    `iv || authTag || ciphertext` (документировать расклад байт в JSDoc).
- Алгоритм: AES-256-GCM, Node `crypto`.
- Зависимости: только Node builtins; пакет остаётся leaf (без Prisma).
- Совместимость: запись через `asEncryptedValue` из `@aiflow/db`.
- Unit-тесты: round-trip, wrong key, truncated key, malformed envelope.
- **Scope**: mvp-0.

### Open question #4 — docker.sock

- В compose worker **оставляет** mount
  `/var/run/docker.sock:/var/run/docker.sock` с комментарием **dev-only**.
- В SPEC / code comments / краткая пометка в assumptions: для prod нужны
  remote Docker (TLS) / отдельный Docker host / K8s Jobs — **не реализуется
  в 2.3**; Vault и Docker Swarm secrets **не вводить**.
- Worker при старте в `ENVIRONMENT=prod` без явного `DOCKER_HOST` remote —
  log warning (не обязательно hard-fail в MVP-0).
- **Scope**: mvp-0 (документирование + dev path).

## Data entities

Существующие модели — без обязательной Prisma-миграции новых полей, если id
синхронизации Meta/Deployment достаточно на уровне приложения:

- **ModelConfig** (project schema): `id`, `projectId` (@unique), `config` Json
  (envelope), `createdAt`, `updatedAt`, `deletedAt`.
  - Логический plaintext до encrypt:
    ```json
    {
      "analyst": {
        "provider": "openai",
        "model": "gpt-4o",
        "baseURL": "optional",
        "apiKey": "secret-or-omitted"
      }
    }
    ```
  - На диске колонка `config` = `{ "__encrypted__": "<base64>" }` (весь blob).
  - Тип `ModelConfigValue` в `packages/db` **привести** к этой инварианте
    (сейчас scaffolding `{ model, config: EncryptedValue }` — устаревает;
    обновить в том же таске).

- **Deployment** (project schema): как в Prisma — `status`, `log`, `url`,
  `imageTag`, `completedAt`, soft-delete.

- **DeploymentMeta** (public): `status`, `url`, soft-delete; id = Deployment.id.

- **DeploymentStatus**: `BUILDING` | `DEPLOYED` | `FAILED` (уже в schema).

Dashboard badge «последний статус сборки»: читать последний
`DeploymentMeta` по `projectId` (`deletedAt: null`, order by createdAt desc) —
если экран Dashboard ещё не показывает это, минимально обновить карточку
проекта **или** оставить на follow-up; не блокер 2.3, если deployments UI
полный.

## APIs and integrations

### `@aiflow/crypto`

- Публичный surface `packages/crypto/src/index.ts`.
- Consumers: `apps/web` (ModelConfig write/read), потенциально worker (нет
  нужды decrypt для deploy), future `model-router`.

### `@aiflow/queue` + Redis

- `REDIS_URL` / существующие compose env.
- App: producer only. Worker: consumer `deploy:run`.

### dockerode (worker only)

- Dependency в `apps/worker` (не в `apps/web`).
- Dev: socket. Prod: deferred (OQ #4).

### Gitea

- Clone/commit через уже существующий `shared/gitea` (web export) и во worker —
  либо переиспользовать HTTP archive/clone URL с admin token, либо тонкий
  git CLI в worker. Assumption: worker использует **git clone** с token URL
  (`http://oauth2:TOKEN@gitea:3000/...`) — без дублирования полного editor API.

### Шаблоны Docker

- Файлы-шаблоны в репозитории платформы, например
  `apps/web/src/features/deploy/templates/Dockerfile.tmpl` и
  `docker-compose.yml.tmpl` (или `shared/deploy-templates`).
- Содержимое MVP: multi-stage Node 22 → Next.js standalone **или** простой
  `node:22-bookworm` + `yarn start` — выбрать минимально собираемый шаблон,
  совместимый с codegen stack (Next.js). Если репо пользователя ещё пустое —
  build может FAIL с понятным логом (ожидаемо).

### UI / FSD

- Слайсы: `features/model-config`, `features/deploy` (или один `features/deploy`
  - model-config рядом) — каждый со своим `index.ts`.
- Routes: только wiring в `app/`.
- Примитивы `@aiflow/ui`; светлая тема; тексты UI на русском.
- `@source` в `globals.css` при новых директориях с классами.

## AI agents and automation

- Новых AI-агентов нет.
- Analyst (чат) продолжает работать; меняется только источник
  provider/model/key (ModelConfig → env fallback).
- Автодеплой после Coder (архитектура §4 шаг 7) — **не** в 2.3; только ручной
  trigger.

## Non-functional requirements

- **Platform**: веб, существующее Next.js App Router приложение AI Studio +
  worker-контейнер.
- **Stack**: Next.js 15, BullMQ, dockerode (worker), `@aiflow/crypto` (Node
  crypto), Prisma project+public clients, Gitea, Redis, Tailwind v4 +
  `@aiflow/ui`.
- **Design**: светлая тема, минимализм, акцент blue (#2563EB), Inter; UI на
  русском (`docs/09-ui-spec.md`).
- **Deployment (платформы)**: `docker compose up`; worker с docker.sock
  (dev-only). `ENCRYPTION_KEY` обязателен для записи ModelConfig (уже в
  `.env.example`).
- **Constraints**:
  - Next.js **stateless / no long work**: только enqueue + короткие Gitea/
    DB вызовы; build — только worker.
  - FSD boundaries; soft-delete filters; file ≤ 200 / function ≤ 50 /
    complexity ≤ 10.
  - Секреты: API-ключи не логировать, не отдавать в GET, не класть в
    Deployment.log.
  - Лицензии: dockerode / bullmq уже или MIT-совместимы — проверить §8 при
    добавлении.
- **Testing**: Vitest — crypto round-trip; model-config service (mock crypto +
  prisma); deploy route enqueue (mock queue); worker handler с mock dockerode
  (успех/fail → статусы). Без обязательного e2e Docker-in-Docker в CI (локально
  smoke при наличии socket).
- **Observability**: worker пишет прогресс в `Deployment.log` и stdout
  structured log.

## Assumptions and open questions

Принятые решения (зафиксированы; planner не ставит `needsConfirmation`):

1. **`packages/crypto`**: AES-256-GCM; envelope `{"__encrypted__":"<base64>"}`;
   ключ = `ENCRYPTION_KEY` ровно 32 UTF-8 байта; расклад
   `iv(12) || tag(16) || ciphertext` внутри Base64.
2. **ModelConfig колонка**: encrypt всего логического JSON blob; GET никогда не
   возвращает plaintext apiKey (`hasApiKey` + публичные поля).
3. **Только роль Analyst** в UI/API 2.3; coder/planner keys — позже.
4. **Chat fallback**: ModelConfig analyst key → иначе env
   (`createProviderFromEnv`). Embeddings остаются на env.
5. **Одинаковый UUID** у `Deployment` и `DeploymentMeta`.
6. **Один активный BUILDING** на проект (409).
7. **Export шаблонов** перед сборкой по умолчанию (перезапись Dockerfile /
   compose в Gitea).
8. **Приёмка build**: успешный `dockerode.buildImage` → `DEPLOYED` + stub URL;
   Traefik/публичный домен — вне объёма; запуск контейнера optional.
9. **docker.sock — dev-only** (OQ #4); prod remote Docker / K8s / Vault —
   **не** проектировать и не реализовывать в 2.3.
10. **Next.js не импортирует dockerode**; worker — единственный consumer.
11. **Очереди**: `@aiflow/queue` реализует definitions; handler обязателен
    только для `deploy:run`.
12. **Кнопка «Сборка» в editor** вызывает реальный `POST /deployments`.
13. **BASIC** видит deployments read-only; start/export/model-config — Pro.
14. **Обновить** `ModelConfigValue` / docs alignment под envelope-колонку.
15. **Шаблоны** — минимальный Node/Next Dockerfile + compose с одним сервисом
    `app`.

Открытые (не блокируют план; выбирает реализация):

16. Точный Dockerfile шаблон (standalone vs `next start`) — что стабильнее
    соберёт пустой/ранний репозиторий пользователя.
17. Worker: git binary в `node:22-bookworm` image vs чистый Gitea archive ZIP
    через HTTP.
18. Нужен ли hard-fail worker при `ENVIRONMENT=prod` + только docker.sock —
    в MVP достаточно warning.
19. Dashboard badge последнего деплоя — в том же PR или сразу после.
20. Синхронизация `config-types.ts` с docs/03 комментарием про per-role shape —
    сделать в 2.3 вместе с crypto.
