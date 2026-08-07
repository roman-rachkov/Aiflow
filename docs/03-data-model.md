# AI Studio – Data model and database schema

## 1. Data organization principles

- **Multi-tenancy with hard isolation**: each project gets its own PostgreSQL schema (`project_{uuid}`). Shared data (users, project metadata) lives in the `public` schema.
- **Dynamic Prisma connection**: project data operations use a separate Prisma client whose `connectionString` points at the target schema.
- **Versioning**: specifications are stored as immutable records with an auto-incrementing version.
- **Encryption**: sensitive fields (API keys) are stored encrypted (AES-256-GCM) and decrypted only at use time.

## 2. The `public` schema (shared data)

```prisma
// schema.prisma – Public schema

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider      = "prisma-client-js"
  output        = "../generated/public"
  // Host (Windows) + compose (node:22-bookworm / debian) share the bind-mounted
  // generated/ tree. Without both targets, a Windows `prisma generate` leaves
  // the Linux app unable to load the query engine.
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

// Platform user. `image`, `emailVerified` and `passwordHash` serve NextAuth:
// the first two are named by the adapter contract (not by us), `passwordHash`
// backs the dev-only Credentials provider. `role` (authorization — only USER is
// exercised in MVP, ADMIN/OWNER carried so the admin panel needs no migration)
// and `uiMode` (presentation — the earlier "Customer"/"Engineer" split, one
// application switched by the user) are separate concerns. See CLAUDE.md for
// the soft-delete rule — every domain model has `deletedAt` and queries must
// filter `deletedAt: null` manually (no Prisma extension).
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime?
  passwordHash  String?
  role          UserRole  @default(USER)
  uiMode        UiMode    @default(BASIC)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  projects ProjectMeta[]
  accounts Account[]
  sessions Session[]
}

enum UserRole {
  OWNER
  ADMIN
  USER
}

enum UiMode {
  BASIC
  PRO
}

// Project metadata — the pointer to the project's own schema.
model ProjectMeta {
  id                 String        @id @default(uuid())
  name               String
  description        String?       @db.Text
  schemaName         String        @unique // e.g. project_abc123
  ownerId            String
  owner              User          @relation(fields: [ownerId], references: [id])
  status             ProjectStatus @default(ACTIVE)
  // Gitea repo identity — nullable until lazy provision (Task 2.2).
  giteaOwner         String?
  giteaRepo          String?
  giteaDefaultBranch String        @default("main")
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  // Soft delete — `deletedAt` is the single deletion mechanism; the former
  // ProjectStatus.DELETED value was removed to avoid two indicators that disagree.
  deletedAt          DateTime?

  deployments DeploymentMeta[]

  @@unique([giteaOwner, giteaRepo])
  @@index([ownerId])
  @@index([deletedAt])
}

enum ProjectStatus {
  ACTIVE
  ARCHIVED
}

// Deploy summary. Full build logs live in the project schema (Deployment).
model DeploymentMeta {
  id        String           @id @default(uuid())
  projectId String
  project   ProjectMeta      @relation(fields: [projectId], references: [id])
  status    DeploymentStatus @default(BUILDING)
  url       String?
  createdAt DateTime         @default(now())
  deletedAt DateTime?

  @@index([projectId, createdAt])
}

enum DeploymentStatus {
  BUILDING
  DEPLOYED
  FAILED
}

// NextAuth adapter models (Account, Session, VerificationToken) also live in the
// public schema. They are owned by @auth/prisma-adapter (written directly by the
// adapter, not application code) and follow the adapter's naming contract; see
// schema.prisma for their full definitions.
```

The `public` schema is the only one migrated by `prisma migrate`. Per-project
schemas are created from generated SQL — see § 8.

## 3. The `project_{uuid}` schema (project-scoped data)

Each project gets its own schema with the following contents:

```prisma
// schema_project_template.prisma – Project schema template
//
// NOT migrated by `prisma migrate`. This file is the source for a generated SQL
// script, applied into project_{uuid} when a project is created. See § 8.

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider      = "prisma-client-js"
  output        = "../generated/project"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

// LLM provider and model configuration per AI role. `config` is one AES-256-GCM
// envelope {"__encrypted__": "..."} wrapping the full logical blob. Prisma
// cannot express this invariant, so the column is `Json` but writes go through
// `ModelConfigValue` / `asEncryptedValue` in packages/db/src/config-types.ts
// (no `@default` — see § 5).
model ModelConfig {
  id        String   @id @default(uuid())
  projectId String   @unique
  config    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?
}

// Immutable specification version. Never updated — a new version is inserted.
model Specification {
  id         String   @id @default(uuid())
  version    Int
  content    String   @db.Text
  createdAt  DateTime @default(now())
  createdBy  SpecAuthor
  // Approval is a fact about a version, not a mutable project flag: approving v2
  // must not silently approve v3. UI gates code generation on this.
  approvedAt DateTime?
  approvedBy String?
  deletedAt  DateTime?

  tasks Task[]

  @@unique([version])
  @@index([approvedAt])
}

enum SpecAuthor {
  USER
  AI
}

// One atomic unit of work for the Coder.
model Task {
  id          String     @id @default(uuid())
  title       String
  description String     @db.Text // full prompt for the Coder
  acceptance  String     @db.Text
  status      TaskStatus @default(PENDING)
  priority    Priority   @default(MEDIUM)
  // Manual reordering on the roadmap needs a stable sort key that is
  // independent of priority.
  sortOrder   Int        @default(0)

  specificationId String?
  specification   Specification? @relation(fields: [specificationId], references: [id])

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  startedAt   DateTime?
  completedAt DateTime?
  deletedAt   DateTime?

  logs       TaskLog[]
  dependsOn  TaskDependency[] @relation("dependent")
  dependedBy TaskDependency[] @relation("prerequisite")
  fileLocks  FileLock[]

  @@index([status])
  @@index([sortOrder])
  @@index([deletedAt])
}

// Explicit dependency edges. `kind` distinguishes what the Planner conflated:
// HARD blocks execution, SOFT only affects ordering.
model TaskDependency {
  id             String         @id @default(uuid())
  dependentId    String
  dependent      Task           @relation("dependent", fields: [dependentId], references: [id], onDelete: Cascade)
  prerequisiteId String
  prerequisite   Task           @relation("prerequisite", fields: [prerequisiteId], references: [id], onDelete: Cascade)
  kind           DependencyKind @default(HARD)

  @@unique([dependentId, prerequisiteId])
  @@index([prerequisiteId])
}

enum DependencyKind {
  HARD
  SOFT
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  AWAITING_REVIEW
  DONE
  FAILED
  CANCELLED
}

enum Priority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

// Task progress checkpoint. Survives Redis loss — workers resume from here, so
// this table is the durable half of the queue.
model TaskLog {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  message   String   @db.Text
  level     LogLevel @default(INFO)
  createdAt DateTime @default(now())

  @@index([taskId, createdAt])
}

enum LogLevel {
  INFO
  WARN
  ERROR
}

// Analyst interview history. `tokensIn` / `tokensOut` are nullable because both
// a streaming mock and a dropped connection leave them absent — NULL is an
// honest "we don't know", not a zero.
model ChatMessage {
  id         String      @id @default(uuid())
  role       ChatRole
  content    String      @db.Text
  tokensIn   Int?
  tokensOut  Int?
  createdAt  DateTime    @default(now())
  deletedAt  DateTime?

  @@index([createdAt])
}

enum ChatRole {
  USER
  ASSISTANT
  SYSTEM
}

// Uploaded file metadata. Bytes live in MinIO under storageKey.
model UserFile {
  id         String   @id @default(uuid())
  fileName   String
  fileSize   Int
  mimeType   String
  storageKey String   @unique
  createdAt  DateTime @default(now())
  deletedAt  DateTime?

  document Document?
}

// A RAG-indexed source. Vector storage is project-scoped so pgvector indexes
// are dropped with the schema.
model Document {
  id         String         @id @default(uuid())
  userFileId String?        @unique
  userFile   UserFile?      @relation(fields: [userFileId], references: [id], onDelete: Cascade)
  sourceType DocumentSource
  title      String
  url        String?
  status     IndexStatus    @default(PENDING)
  createdAt  DateTime       @default(now())
  indexedAt  DateTime?
  deletedAt  DateTime?

  chunks DocumentChunk[]

  @@index([status])
}

enum DocumentSource {
  UPLOAD
  URL
  SPECIFICATION
}

enum IndexStatus {
  PENDING
  INDEXING
  INDEXED
  FAILED
}

// Chunk + embedding. The vector column and HNSW index are added by the generated
// SQL script, not here — Prisma has no native vector type:
//   ALTER TABLE "DocumentChunk" ADD COLUMN embedding vector(768);
//   CREATE INDEX ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops);
model DocumentChunk {
  id         String   @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  chunkIndex Int
  content    String   @db.Text
  tokenCount Int?
  createdAt  DateTime @default(now())

  @@unique([documentId, chunkIndex])
}

// Protects hand-written code from being overwritten by generation — an MVP-1
// readiness criterion.
model FileLock {
  id        String   @id @default(uuid())
  filePath  String   @unique
  reason    LockReason
  taskId    String?
  task      Task?    @relation(fields: [taskId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  deletedAt DateTime?
}

enum LockReason {
  MANUAL_EDIT
  ACTIVE_TASK
}

// Agent embedded into the target application
model EmbeddedAgent {
  id        String      @id @default(uuid())
  name      String
  type      AgentType   @default(SUPPORT_BOT)
  config    Json
  status    AgentStatus @default(INACTIVE)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  deletedAt DateTime?
}

enum AgentType {
  SUPPORT_BOT
  CUSTOM
}

enum AgentStatus {
  INACTIVE
  TRAINING
  ACTIVE
  FAILED
}

// Deploy artifact (build logs etc.)
model Deployment {
  id          String           @id @default(uuid())
  projectId   String
  status      DeploymentStatus @default(BUILDING)
  log         String?          @db.Text
  url         String?
  imageTag    String?
  createdAt   DateTime         @default(now())
  completedAt DateTime?
  deletedAt   DateTime?

  @@index([createdAt])
}

enum DeploymentStatus {
  BUILDING
  DEPLOYED
  FAILED
}
```

## 4. Dynamic schema switching in Prisma

The application uses a connection pool for the `public` schema and creates a separate Prisma client per project with a modified `connectionString`:

```typescript
// Example of creating a project client
import { PrismaClient } from '../generated/project';

const clients = new Map<string, PrismaClient>();

function getProjectClient(schemaName: string): PrismaClient {
  const cached = clients.get(schemaName);
  if (cached) return cached;

  // Reject anything that is not a schema name we generated, before it reaches
  // the connection string.
  if (!/^project_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  const baseUrl = process.env.DATABASE_URL; // ...?schema=public
  const projectUrl = baseUrl.replace('schema=public', `schema=${schemaName}`);
  const client = new PrismaClient({ datasources: { db: { url: projectUrl } } });
  clients.set(schemaName, client);
  return client;
}

async function evictProjectClient(schemaName: string): Promise<void> {
  const client = clients.get(schemaName);
  if (!client) return;
  await client.$disconnect();
  clients.delete(schemaName);
}
```

Clients are cached in a **`Map`** and evicted explicitly when a project is archived or deleted.

An earlier revision of this document specified a `WeakMap`. That was not merely ineffective but
invalid — `WeakMap` requires object keys, so `.set(schemaName, client)` with a string throws
`TypeError`. Resolved as C1 in [14-decisions-needed.md](14-decisions-needed.md).

## 5. Encrypting sensitive data

The `ModelConfig.config` column holds the **entire** logical JSON blob as one
AES-256-GCM envelope (not a nested `{ model, config }` pair). Before writing:

1. Serialize the logical JSON (e.g. `{ analyst: { provider, model, baseURL?, apiKey? } }`) to a string.
2. Encrypt with AES-256-GCM via `@aiflow/crypto` under `process.env.ENCRYPTION_KEY` (exactly 32 UTF-8 bytes).
3. Store `{ "__encrypted__": "<base64 of iv(12)||authTag(16)||ciphertext>" }` — typed as `ModelConfigValue` / guarded by `asEncryptedValue` in `packages/db`.

Reading reverses the process. The master key must be 32 bytes long and kept in secure storage (environment variable, Vault).

## 6. Versioning and audit

- `Specification` — append-only; each version bumps the counter. A link to the previous version can be stored for convenience (optional for MVP — comparison uses the Git history of `SPEC.md`).
- `Task` and `TaskLog` — a full journal of AI agent actions, available for audit.
- `Deployment` — deploy history with logs.

## 7. Indexes and performance (MVP)

A minimal index set is enough for MVP:

- `User(email)` — unique.
- `ProjectMeta(ownerId)` — for listing a user's projects; `ProjectMeta(deletedAt)` for soft-delete filtering.
- `Task(status)`, `Task(sortOrder)`, `Task(deletedAt)` — for selecting active tasks and roadmap ordering. (There is no `projectId` column on `Task` — it links to a project via `specificationId`.)
- `Specification(version)` — unique, for fetching a specific version; `Specification(approvedAt)` for the approval gate.

Under future load growth, sharding by `projectId` and moving analytics data to separate storage are both options.

## 8. Migrations

Migrations are managed at two levels:

- Public schema: standard Prisma migrations (`prisma migrate dev`).
- Project schemas: on new project creation, a SQL script (generated from `schema_project_template.prisma`) creates the schema and all tables. Updating project schemas (when the model changes) requires migrating existing projects via a script, which is rare in MVP.
