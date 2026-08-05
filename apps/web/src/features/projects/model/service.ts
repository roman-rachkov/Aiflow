/**
 * Project CRUD against the `public` schema's `ProjectMeta`, plus the
 * create-time provisioning of the per-project PostgreSQL schema.
 *
 * Create is a two-step compensation saga rather than one transaction:
 * `createProjectSchema` runs over a raw `pg` connection (its own transaction,
 * see packages/db/src/schema-executor.ts) and `projectMeta.create` runs over
 * Prisma — two independent connections that cannot share a transaction. On
 * failure of the insert, the freshly-created schema is dropped back by
 * `dropProjectSchema`, which is documented as safe exactly for this case (a
 * brand-new, empty schema). A process crash between the two steps leaves an
 * orphan schema; acceptable for MVP and noted here so it is not a surprise.
 *
 * Delete is soft-delete only (the architectural invariant in CLAUDE.md): the
 * `ProjectMeta` row gets `deletedAt: now()` and the schema is retained for
 * restore. `evictProjectClient` is mandatory here — without it the cached
 * Prisma client holds a connection for the process lifetime.
 */
import {
  createProjectSchema,
  dropProjectSchema,
  evictProjectClient,
  generateProjectSchemaName,
  getPublicClient,
} from '@aiflow/db';

import type { ProjectView } from './types';

/** Input for creating a project. `ownerId` comes from the session, not the body. */
export interface CreateProjectInput {
  name: string;
  description?: string;
  ownerId: string;
}

type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

/** Prisma row → view. Drops `schemaName`, `ownerId`, `deletedAt` from the DTO. */
function toView(row: {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}): ProjectView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All non-deleted projects owned by a user, newest first. */
export async function listProjects(ownerId: string): Promise<ProjectView[]> {
  const rows = await getPublicClient().projectMeta.findMany({
    where: { ownerId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map(toView);
}

/**
 * One project, only if it belongs to `ownerId` and is not deleted.
 * Returns `null` for missing, deleted, or owned-by-someone-else — the caller
 * cannot tell the three apart, which is deliberate (no existence leak).
 */
export async function getProject(id: string, ownerId: string): Promise<ProjectView | null> {
  const row = await getPublicClient().projectMeta.findUnique({
    where: { id, deletedAt: null },
  });

  if (!row || row.ownerId !== ownerId) return null;

  return toView(row);
}

/**
 * Create a project and provision its schema.
 *
 * Saga: generate a schema name → create the schema → insert the `ProjectMeta`
 * row → on insert failure, drop the schema to compensate. `ownerId` is taken
 * from the session upstream and is never trusted from the client.
 */
export async function createProject(input: CreateProjectInput): Promise<ProjectView> {
  const schemaName = generateProjectSchemaName();

  await createProjectSchema(schemaName);

  let row;
  try {
    row = await getPublicClient().projectMeta.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        schemaName,
        ownerId: input.ownerId,
        status: 'ACTIVE',
      },
    });
  } catch (error) {
    // Compensate: drop the schema we just created so there is no orphan. The
    // `.catch` swallows only the rollback failure — the original error is the
    // one rethrown, so the cause is not hidden behind a cleanup problem.
    await dropProjectSchema(schemaName).catch(() => {});
    throw error;
  }

  return toView(row);
}

/**
 * Soft-delete a project: set `deletedAt` and evict the cached project client.
 * Returns `false` if the project does not exist / is already deleted / is not
 * owned by `ownerId` (same null-or-foreign treatment as `getProject`). The
 * schema itself is retained for restore.
 */
export async function removeProject(id: string, ownerId: string): Promise<boolean> {
  const row = await getPublicClient().projectMeta.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true, schemaName: true },
  });

  if (!row || row.ownerId !== ownerId) return false;

  await getPublicClient().projectMeta.update({
    where: { id: row.id },
    data: { deletedAt: new Date() },
  });
  await evictProjectClient(row.schemaName);

  return true;
}
