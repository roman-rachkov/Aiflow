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
  provider = "prisma-client-js"
}

// Platform user
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  projects ProjectMeta[]
}

// Project metadata (pointer to the schema)
model ProjectMeta {
  id          String   @id @default(uuid())
  name        String
  description String?  @db.Text
  schemaName  String   @unique // e.g. project_abc123
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  status      ProjectStatus @default(ACTIVE)
  // Soft delete — see the convention on User. `deletedAt` is the single
  // deletion mechanism; the former ProjectStatus.DELETED value was removed.
  deletedAt   DateTime?

  deployments DeploymentMeta[]
}

enum ProjectStatus {
  ACTIVE
  ARCHIVED
}

// Deploy summary (details live in the project schema)
model DeploymentMeta {
  id          String   @id @default(uuid())
  projectId   String
  project     ProjectMeta @relation(fields: [projectId], references: [id])
  status      String   // "building", "deployed", "failed"
  url         String?
  createdAt   DateTime @default(now())
}
```

## 3. The `project_{uuid}` schema (project-scoped data)

Each project gets its own schema with the following contents:

```prisma
// schema_project_template.prisma – Project schema template

datasource db {
  provider = "postgresql"
  url      = env("PROJECT_DATABASE_URL") // schema is set dynamically
}

generator client {
  provider = "prisma-client-js"
}

// AI model configuration for this project
model ModelConfig {
  id        String @id @default(uuid())
  projectId String @unique // duplicated for integrity within the schema
  // JSON shape: { "analyst": { "provider":"routerai", "model":"gpt-4o" }, "coder": {...} }
  config    Json   @default("{}")
}

// Specification version
model Specification {
  id        String   @id @default(uuid())
  version   Int      @default(1)
  content   String   @db.Text // Markdown text
  createdAt DateTime @default(now())
  createdBy String   // "user" or "ai"
}

// Code generation task
model Task {
  id          String    @id @default(uuid())
  title       String
  description String    @db.Text // full prompt for the Coder
  status      TaskStatus @default(PENDING)
  priority    Int       @default(0)
  acceptance  String?   @db.Text // acceptance criteria
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  completedAt DateTime?

  logs        TaskLog[]
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  AWAITING_REVIEW
  DONE
  FAILED
  CANCELLED
}

// Task execution log
model TaskLog {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id])
  message   String   @db.Text
  level     LogLevel @default(INFO)
  createdAt DateTime @default(now())
}

enum LogLevel {
  INFO
  WARN
  ERROR
}

// Agent embedded into the target application
model EmbeddedAgent {
  id          String   @id @default(uuid())
  name        String
  type        String   // "support_bot", "custom"
  config      Json     @default("{}") // workflow parameters
  status      String   @default("inactive")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Deploy artifact (build logs etc.)
model Deployment {
  id          String   @id @default(uuid())
  projectId   String
  status      String   @default("building")
  log         String?  @db.Text
  url         String?
  imageTag    String?
  createdAt   DateTime @default(now())
  completedAt DateTime?
}

// Optional storage of user files (metadata)
model UserFile {
  id        String   @id @default(uuid())
  fileName  String
  fileSize  Int
  mimeType  String
  storageKey String  // path in MinIO
  createdAt DateTime @default(now())
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

The `ModelConfig.config` field holds encrypted API keys. Before writing to the database:

1. Serialize the JSON to a string.
2. Encrypt with AES-256-GCM using the master key (`process.env.ENCRYPTION_KEY`).
3. Store it in `config` as a JSON object with a single `__encrypted__` key whose value is the Base64 string of the encrypted data.

Reading reverses the process. The master key must be 32 bytes long and kept in secure storage (environment variable, Vault).

## 6. Versioning and audit

- `Specification` — append-only; each version bumps the counter. A link to the previous version can be stored for convenience (optional for MVP — comparison uses the Git history of `SPEC.md`).
- `Task` and `TaskLog` — a full journal of AI agent actions, available for audit.
- `Deployment` — deploy history with logs.

## 7. Indexes and performance (MVP)

A minimal index set is enough for MVP:

- `User(email)` — unique.
- `ProjectMeta(ownerId)` — for listing a user's projects.
- `Task(status, projectId)` — for selecting active tasks.
- `Specification(version, projectId)` — for fetching the latest version.

Under future load growth, sharding by `projectId` and moving analytics data to separate storage are both options.

## 8. Migrations

Migrations are managed at two levels:

- Public schema: standard Prisma migrations (`prisma migrate dev`).
- Project schemas: on new project creation, a SQL script (generated from `schema_project_template.prisma`) creates the schema and all tables. Updating project schemas (when the model changes) requires migrating existing projects via a script, which is rare in MVP.
