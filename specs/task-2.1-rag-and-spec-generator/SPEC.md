# Task 2.1 — RAG and SPEC generator (MVP-0)

## Goal and context

Эта спецификация описывает только задачу 2.1 из roadmap AI Studio — RAG-индексацию
загруженных файлов и генерацию SPEC.md из диалога с аналитиком, в варианте MVP-0.
Задача достраивает первичный пользовательский путь поверх чата из Task 1.3:
пользователь загружает документы → они индексируются → аналитик отвечает с учётом
контекста документов → по команде «Создать спецификацию» генерируется SPEC.md и
сохраняется новой версией.

Что входит в объём:

- API загрузки файлов в объектное хранилище MinIO и чтения списка загруженных
  файлов проекта.
- RAG-пайплайн: разбиение текста на чанки, векторизация (эмбеддинги), запись в
  `Document` / `DocumentChunk` (pgvector), retrieval топ-k релевантных чанков по
  последнему сообщению пользователя.
- Модификация чата аналитика: перед вызовом модели к системному промпту
  подмешиваются релевантные фрагменты документов (контекст RAG).
- Генерация SPEC.md по команде пользователя: полный диалог + RAG-контекст → LLM
  генерирует SPEC по шаблону аналитика → сохраняется новой версией в `Specification`
  (`version = max + 1`, `createdBy = AI`).
- Просмотр SPEC: список версий и содержимое выбранной версии. Панель артефактов
  экрана Researcher (заглушки из 1.3) оживает — список версий спецификации, выбор и
  просмотр. Кнопка «Создать спецификацию» теперь триггерит генерацию (в 1.3 была
  UI-заглушкой).
- Универсальный OpenAI-совместимый провайдер в `packages/ai-roles`: конфигурируемые
  `baseURL` / `apiKey` / `model`; обслуживает и chat (аналитик), и embeddings (RAG).
  z.ai становится инстансом с его `baseURL`.

Что НЕ входит (более поздние задачи):

- Сравнение версий SPEC (diff) — отдельный мини-таск после 2.1; здесь только список
  версий и просмотр выбранной.
- Экран настройки ModelConfig (выбор провайдера/модели и ввод API-ключей через UI) —
  Task 2.3. В MVP-0 провайдер читается из переменных окружения.
- Редактирование SPEC вручную через UI — только генерация новой версии.
- Поддержка URL-источников (документы по ссылке) — только загрузка файлов; модель
  `DocumentSource` уже различает `UPLOAD` / `URL` / `SPECIFICATION`, но путь `URL` в
  Task 2.1 не реализуется.
- Очередь `spec:generate` и фоновая индексация — загрузка и индексация выполняются
  синхронно в route handler-е (см. Background processes); воркеры — MVP-1.

Для кого: все аутентифицированные пользователи (оба режима UI). Владелец проекта
может загружать файлы, индексировать их, получать ответы аналитика с учётом
контекста и генерировать спецификацию.

## Users and roles

Экраны и API доступны одному типу пользователя платформы — аутентифицированному
владельцу проекта. Проверка через `requireUser()` (сессия) и
`canAccessProject(userId, projectId)` (владение). Режим UI (`BASIC` / `PRO`) на объём
Task 2.1 не влияет. Роли `ADMIN` / `OWNER` в MVP-0 не задействованы.

(Роли, относящиеся к платформе в целом, описаны в `specs/ai-studio/SPEC.md` и здесь
не повторяются.)

## Functional requirements

### API: загрузка файлов

- **Endpoint**: `POST /api/projects/[id]/files`
- **Available to**: владелец проекта.
- **Request**: `multipart/form-data`, поле `file` — единственный файл. Поддерживаемые
  типы в MVP-0: `text/plain`, `text/markdown`, `application/pdf`, `application/json`.
  Ограничение размера — по конфигурации Next.js (по умолчанию 4 MB body).
- **Response**: `201` с JSON `{ id, fileName, fileSize, mimeType, storageKey }`.
- **Logic**:
  1. `requireUser()` → `canAccessProject` → `resolveProjectSchema` (по паттерну
     `app/api/projects/[id]/chat/route.ts`: `projectMeta.findUnique` + проверка
     `ownerId` / `deletedAt`).
  2. Прочитать файл из multipart. Сгенерировать `storageKey` = `project_{schemaHash}/{uuid}`
     (ключ содержит идентификатор проекта, чтобы файлы не смешивались в бакете).
  3. Загрузить байты в MinIO через клиент `apps/web/src/shared/minio`.
  4. Сохранить метаданные в `UserFile` (project-scoped Prisma-клиент):
     `fileName`, `fileSize`, `mimeType`, `storageKey`.
  5. Создать запись `Document` (`sourceType = UPLOAD`, `title = fileName`,
     `status = PENDING`) и связать с `UserFile`.
  6. Вернуть view.
- **Errors**: 400 (нет файла / неподдерживаемый тип), 404 (нет доступа к проекту),
  500 (ошибка MinIO).

### API: список файлов

- **Endpoint**: `GET /api/projects/[id]/files`
- **Response**: `200` с JSON-массивом view файлов
  `[{ id, fileName, fileSize, mimeType, indexStatus, createdAt }]` — JOIN `UserFile` с
  её `Document.indexStatus`.
- **Logic**: `requireUser` → `canAccessProject` → `resolveProjectSchema` →
  `userFile.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } })` +
  `_count`/включение `Document` для статуса.

### API: индексация файла (RAG)

- **Endpoint**: `POST /api/projects/[id]/files/[fid]/index`
- **Available to**: владелец проекта.
- **Response**: `200` с `{ documentId, status, chunkCount }` после индексации
  (синхронно), либо `202` если индексация запущена. В MVP-0 — **синхронно**: `200` с
  `status = INDEXED` и числом чанков.
- **Logic**:
  1. `requireUser` → `canAccessProject` → `resolveProjectSchema`.
  2. Найти `UserFile` по `fid` (+ проверка принадлежности к проекту через схему).
  3. Установить `Document.status = INDEXING`.
  4. Скачать байты из MinIO → извлечь текст (text/* — напрямую; PDF — текстовый слой;
     JSON — stringify значений; MIME, не сводимый к тексту, → `status = FAILED` с
     причиной).
  5. Разбить текст на чанки (LlamaIndex sentence splitter, целевой размер ~512 токенов,
     overlap ~50).
  6. Для каждого чанка — вычислить эмбеддинг через универсальный провайдер
     (`embeddings` endpoint, модель из env, dim 1536).
  7. Записать `DocumentChunk`-и: `content`, `chunkIndex`, `tokenCount` (оценка), и
     вектор через SQL-запрос (`prisma.$executeRaw` с `vector(1536)` литералом — Prisma
     не выражает тип `vector`; используется функция `pgvector`-формата строки,
     например `'[0.1,0.2,...]'::vector`).
  8. Установить `Document.status = INDEXED`, `indexedAt = now()`.
  9. При ошибке на любом шаге — `Document.status = FAILED`, ответ `200` с
     `status = FAILED` и описанием причины (частичный успех не оставляет схему в
     промежуточном состоянии: либо все чанки записаны и INDEXED, либо FAILED с
     откатом чанков этой попытки).
- **Idempotency**: повторный вызов для уже INDEXED документа пересоздаёт чанки (удаляет
  старые, индексирует заново). Для FAILED — повторяет попытку.

### API: список и просмотр спецификаций

- **Endpoint (список)**: `GET /api/projects/[id]/specifications`
  - **Response**: `200` с массивом view
    `[{ id, version, createdAt, createdBy, approvedAt }]`, отсортированным по
    `version` по убыванию (новая сверху).
- **Endpoint (контент)**: `GET /api/projects/[id]/specifications/[version]`
  - **Response**: `200` с `{ id, version, content, createdAt, createdBy }`.
  - **Errors**: 404 если версия не существует.

### API: генерация спецификации

- **Endpoint**: `POST /api/projects/[id]/specifications`
- **Available to**: владелец проекта.
- **Request body**: `{}` (без параметров; использует весь диалог и RAG).
- **Response**: `200` с view новой версии `{ id, version, content, createdAt }`.
- **Logic**:
  1. `requireUser` → `canAccessProject` → `resolveProjectSchema`.
  2. Загрузить всю историю диалога (`listMessages`).
  3. RAG-retrieval: для последнего сообщения пользователя (или агрегированного смысла
     диалога) получить топ-k релевантных чанков из индексированных документов.
  4. Построить промпт генерации SPEC: системный промпт по шаблону аналитика (раздел
     «SPEC.md format» из `.claude/agents/analyst.md`) + диалог + RAG-контекст.
  5. Вызвать универсальный провайдер (`chat`, без стриминга — нужен полный текст).
  6. Вычислить `version = max(existing.version) + 1` (или 1, если версий нет).
  7. Сохранить `Specification.create({ version, content, createdBy: 'AI' })`.
  8. Вернуть view.
- **Errors**: 404 (нет доступа), 500 (ошибка провайдера / генерации).

### Экран "Researcher" (расширение Task 1.3)

- **URL**: `/projects/[id]/research` (без изменений).
- **Что меняется на экране**: левая панель артефактов (была заглушками в 1.3)
  оживает.
  - **«Спецификация»**: вместо «Спецификация не создана» — список версий (если есть).
    Клик по версии открывает модальное окно или отдельный под-раздел с содержимым
    SPEC. Если версий нет — заглушка остаётся.
  - **«Загруженные файлы»**: вместо «Нет файлов» — список файлов с индикатором
    статуса индексации (PENDING / INDEXING / INDEXED / FAILED). Элемент управления
    «Индексировать» для неиндексированных/упавших файлов (вызов `/index`).
  - **Кнопка «Создать спецификацию»**: вместо заглушки — вызывает
    `POST /api/projects/[id]/specifications`, после успеха обновляет список версий и
    показывает новую. Во время генерации — индикатор загрузки.
- **Что НЕ меняется**: центральная панель чата остаётся как в 1.3; RAG теперь
  влияет на ответы аналитика неявно (контекст подмешивается на сервере), UI чата об
  этом не сообщает детально.
- **Scope**: mvp-0.

### Файловый загрузчик (UI-элемент)

- **Element**: на панели «Загруженные файлы» — кнопка/зона загрузки «Загрузить файл»,
  открывающая выбор файла; отправка через `POST /api/projects/[id]/files`
  (`multipart/form-data`). После успеха — файл появляется в списке со статусом
  `PENDING`, доступна кнопка «Индексировать».
- **States**: загрузка (индикатор), успех (новый элемент списка), ошибка (toast).
- **Scope**: mvp-0.

## Background processes

В рамках Task 2.1 фоновых задач (очередей, воркеров, cron) нет. Загрузка файла и
индексация выполняются **синхронно** в route handler-е.

Обоснование против платформенного инварианта «Next.js приложение не делает долгую
работу»: индексация одного файла в MVP-0 — это порядка десятка чанков и один батч
эмбеддингов (сотни мс на быстром endpoint-е), что укладывается в таймаут HTTP-запроса
и не требует воркера. Порог, после которого индексация переходит в фоновый воркер
(очередь `spec:generate` и смежные) — это MVP-1:批量 загрузка, большие PDF, медленные
embedding-endpoint-ы. Это зафиксированное допущение, а не упущение — переход на
воркер при необходимости тривиален (логика индексации изолирована в feature-сервисе).

## Data entities

**Новых моделей не требуется.** Все нужные модели уже есть в
`packages/db/prisma/schema_project_template.prisma` и создаются для каждого проекта
генератором SQL:

- **UserFile** (строки 182-193): `id`, `fileName`, `fileSize`, `mimeType`,
  `storageKey @unique`, `createdAt`, `deletedAt`, связь `document Document?`.
- **Document** (строки 198-214): `id`, `userFileId`, `sourceType`, `title`, `url?`,
  `status IndexStatus`, `createdAt`, `indexedAt?`, `deletedAt?`, `chunks`.
- **DocumentChunk** (строки 233-243): `id`, `documentId`, `chunkIndex`, `content`,
  `tokenCount?`, `createdAt`. Векторный столбец `embedding vector(1536)` и HNSW-индекс
  добавляются сгенерированным DDL (`packages/db/src/project-schema.ts:39`), не Prisma.
- **Specification** (строки 40-58): `id`, `version @unique`, `content @db.Text`,
  `createdAt`, `createdBy SpecAuthor`, `approvedAt?`, `approvedBy?`, `deletedAt?`.

Изменений в схеме нет. Готовность pgvector подтверждена: образ `pgvector/pgvector:pg16`
в `docker-compose.yml:23`, DDL уже создаёт столбец и индекс.

## APIs and integrations

### MinIO (объектное хранилище)

- Клиент в `apps/web/src/shared/minio` (заявлен в code-map как planned).
- Конфигурация из env: `S3_ENDPOINT` (по умолчанию `http://localhost:9000`),
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` (по умолчанию `ai-studio`). Бакет
  создаётся при старте (один бакет на инсталляцию; ключи префиксуются идентификатором
  проекта для изоляции).
- Операции: `putObject(storageKey, bytes, metaData)`, `getObject(storageKey)`.
- В MVP-0 пресет `internal: false` — приложение на хосте обращается к MinIO из
  compose-сети по опубликованному порту.

### Универсальный OpenAI-совместимый провайдер

Расположение: `packages/ai-roles/src/`. Обобщение существующего `zai-live.ts` до
`OpenAICompatibleProvider`.

- **Chat** (стриминг): `POST {baseURL}/chat/completions` с `stream: true`,
  `Authorization: Bearer ${apiKey}`. Парсинг SSE — повторно использует
  `sse-parser.ts`. Возвращает `AsyncIterable<string>` + side-channel `usage`
  (по существующему контракту `chatWithUsage`).
- **Embeddings**: `POST {baseURL}/embeddings` с
  `{ model: embeddingModel, input: string[] }`. Возвращает `number[][]` (массив
  векторов по входным строкам). Добавляется в интерфейс пакета
  (`EmbeddingsProvider.embed(texts: string[]): Promise<number[][]>`).
- **Конфигурация из env в MVP-0** (ModelConfig в БД — Task 2.3):
  - `ZAI_API_KEY` / `OPENAI_API_KEY` — ключ (алиасы).
  - `OPENAI_BASE_URL` (по умолчанию `https://api.openai.com/v1`; для z.ai —
    `https://api.z.ai/api/paas/v4`).
  - `ZAI_MODEL` / `OPENAI_CHAT_MODEL` — chat-модель (по умолчанию `glm-4.6`).
  - `OPENAI_EMBEDDING_MODEL` — модель эмбеддингов (по умолчанию
    `text-embedding-3-small`, dim 1536).
- **z.ai как инстанс**: `createZaiProvider()` становится тонкой обёрткой над
  `createOpenAICompatibleProvider({ baseURL: zaiEndpoint, ... })`, сохраняя
  mock-путь при отсутствии ключа (для локальной разработки без сети).

### RAG-retrieval (pgvector)

- Для последнего сообщения пользователя вычисляется его эмбеддинг (через embeddings
  endpoint универсального провайдера).
- SQL-retrieval через `prisma.$queryRaw`:
  `SELECT id, content, embedding <=> $1 AS distance FROM "DocumentChunk"
 WHERE "documentId" IN (SELECT id FROM "Document" WHERE "deletedAt" IS NULL
 AND status = 'INDEXED')
 ORDER BY embedding <=> $1 LIMIT $2` — косинусное расстояние `lang` pgvector,
  LIMIT k (по умолчанию 5).
- Возвращает топ-k чанков; их `content` форматируется в контекстный блок для
  системного промпта аналитика.

## AI agents and automation

- **Агент «Аналитик» (расширение MVP-0)**: в Task 2.1 получает RAG-контекст. Перед
  вызовом модели выполняется retrieval топ-k чанков по последнему сообщению
  пользователя; их содержимое добавляется в системный промпт отдельным блоком
  («Контекст из загруженных документов: …»). Если индексированных документов нет,
  поведение идентично 1.3 (без RAG). Источники знаний: системный промпт
  (`.claude/agents/analyst.md`), история диалога из `ChatMessage`, релевантные
  чанки `DocumentChunk`. Модель: универсальный OpenAI-совместимый провайдер.
- **Генерация SPEC**: не отдельный агент, а вызов chat-модели с промптом генерации
  (шаблон «SPEC.md format» из `.claude/agents/analyst.md`) + полный диалог +
  RAG-контекст. Без стриминга (нужен полный текст для сохранения).
- **Scope**: mvp-0.

## Non-functional requirements

- **Platform**: веб, интегрируется в существующее Next.js App Router приложение.
- **Stack**: Next.js App Router (route handlers для REST), React 18 (server + client
  components), Tailwind v4 (`@theme` токены из `@aiflow/ui/styles/theme.css`). FSD:
  новые feature-слайсы `features/files` (загрузка/список/индексация файлов) и
  `features/specifications` (список/просмотр/генерация версий); shared-клиент
  `shared/minio`; расширение `packages/ai-roles` (universal provider + embeddings +
  RAG-retrieval). Новые маршруты в `app/api/projects/[id]/` и расширение страницы
  `app/(app)/projects/[id]/research`.
- **Архитектурные соответствия**:
  - `app/` — только маршрутизация; вся логика — в feature-слайсах и пакетах.
  - Auth: `requireUser()` + `canAccessProject()` + `resolveProjectSchema()` во всех
    route handler-ах, по паттерну `app/api/projects/[id]/chat/route.ts`.
  - Доступ к данным: через `getProjectClient(schemaName)`; soft-delete
    (`deletedAt: null`) во всех чтениях.
  - Публичный surface feature-слайсов — через `index.ts`; глубокие пути блокируются
    линтером (`import/no-internal-modules`), кроме осознанных `app/`-внутренних, как
    в существующем chat-route.
  - Soft delete: `UserFile` и `Document` поддерживают; удаления в Task 2.1 не
    требуется (только создание и чтение).
- **Лицензии зависимостей** (§8 product scope, allowlist): `llamaindex@0.12.1` — MIT,
  `@llamaindex/postgres` — MIT (часть монорепо LlamaIndexTS, корневой LICENSE),
  `minio@8.0.7` — Apache-2.0. Все в allowlist, верифицированы по LICENSE-файлу
  (не по бейджу). Copyleft/AGPL/SSPL/BUSL — отсутствуют.
- **Tailwind v4**: новые UI-компоненты используют существующие `@aiflow/ui`
  примитивы (Button, Card) и семантические токены; если добавляется новая
  директория-источник классов — отдельная `@source`-строка в `globals.css`.
- **Тестирование**: Vitest. Сервисные слои (files, specifications) — unit-тесты с
  замоканным Prisma/MinIO. Universal provider — тесты chat (mock+live с замоканным
  fetch) и embeddings. Retrieval — тест с замоканным `$queryRaw`. Route handlers —
  тесты с замоканными зависимостями (по образцу chat route test).
- **Constraints**: размер файла ≤ 200 строк, функция ≤ 50 строк, сложность ≤ 10
  (ESLint warn → блокирует в CI).

## Assumptions and open questions

Принятые решения (зафиксированы, чтобы не пересматривать; planner не должен ставить
`needsConfirmation` для задач, опирающихся на них):

1. **RAG-движок — LlamaIndex.Ts.** Chunker + абстракции retrieval поверх pgvector.
   Лицензия MIT (верифицировано по LICENSE-файлу монорепо LlamaIndexTS). Каждая новая
   зависимость проходит §8 gate.
2. **Универсальный OpenAI-совместимый провайдер.** `zai-live.ts` обобщается до
   `OpenAICompatibleProvider` (конфигурируемые `baseURL/apiKey/model`). Один провайдер
   для chat и embeddings. z.ai — инстанс с его baseURL. Mock-путь сохраняется для
   локальной разработки без ключа.
3. **pgvector — хранилище эмбеддингов.** Embeddings через OpenAI text-embedding-3-small
   совместимый endpoint (dim 1536 уже в DDL). Retrieval — косинусное расстояние
   (`<=>`), LIMIT k (k=5).
4. **SPEC-UI: список версий + просмотр выбранной.** Сравнение версий (diff) отложено —
   отдельный мини-таск после 2.1. Так сужаем объём.
5. **Индексация синхронна.** Загрузка и индексация выполняются в route handler-е, без
   воркера/очереди. Порог перехода на фоновый воркер — MVP-1 (batch, большие PDF,
   медленные endpoints). Логика индексации изолирована в сервисе для тривиального
   переноса.
6. **Поддерживаемые типы файлов (MVP-0)**: `text/plain`, `text/markdown`,
   `application/pdf` (текстовый слой), `application/json`. URL-источники (`DocumentSource.URL`)
   не реализуются.
7. **Генерация SPEC — без стриминга.** Полный ответ модели сохраняется как одна версия.
   `createdBy = AI`. Версия — `max + 1`.
8. **Контекст RAG в чате подмешивается неявно.** UI чата не сообщает пользователю
   подробно об источниках; система просто даёт более осведомлённые ответы. (Точная
   формулировка контекстного блока в системном промпте — на усмотрение реализации,
   должна быть понятна модели.)
9. **«Максимально опенсорс» = опенсорс-зависимости в рамках allowlist §8** — это не
   ослабление §8, а подтверждённый принцип предпочтения. Лицензионный gate
   применяется ко всем новым зависимостям Task 2.1.

Открытые вопросы (требуют решения до или в ходе планирования):

10. **Извлечение текста из PDF.** Нужна ли библиотека (например, `pdf-parse`) или
    достаточно текстового слоя через встроенные средства? Если библиотека — проверить
    лицензию по §8. `pdf-parse` — MIT, допустим. Решение: принять `pdf-parse` (MIT),
    если встроенными средствами Node текст не извлекается тривиально.

11. **Размер и overlap чанков.** Целевые значения (~512 токенов, overlap ~50) —
    разумные дефолты для text-embedding-3-small. Окончательные числа — на усмотрение
    реализации в рамках этих ориентиров.

12. **Фронтенд файловой зоны.** Простой `<input type="file">` + кнопка, или drag-and-
    drop зона? Решение: простой `<input type="file">` в MVP-0 (меньше кода, соответствует
    минимализму 1.3); drag-and-drop — позже.
