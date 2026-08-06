/**
 * Project CRUD against the `public` schema's `ProjectMeta`, plus the
 * create-time provisioning of the per-project PostgreSQL schema and Gitea repo.
 *
 * Create is a compensation saga across independent systems (raw `pg` schema
 * DDL, Gitea HTTP, Prisma insert) that cannot share a transaction:
 *   createProjectSchema → provisionGiteaRepo → projectMeta.create
 * On failure after Gitea: deleteRepo (if provisioned) + dropProjectSchema.
 * Soft-delete does NOT delete the Gitea repo (retained for restore, like the
 * Postgres schema). `evictProjectClient` is mandatory on soft-delete.
 */
import {
  createProjectSchema,
  dropProjectSchema,
  evictProjectClient,
  generateProjectSchemaName,
  getPublicClient,
} from '@aiflow/db';
import { deleteRepo } from '@/shared/gitea';

import { provisionGiteaRepo, type GiteaRepoIdentity } from './gitea-provision';
import type { ProjectView } from './types';

/** Input for creating a project. `ownerId` comes from the session, not the body. */
export interface CreateProjectInput {
  name: string;
  description?: string;
  ownerId: string;
}

type ProjectStatus = 'ACTIVE' | 'ARCHIVED';

/** Prisma row → view. Drops schema/owner/gitea/deletedAt from the DTO. */
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
 * Create a project, provision its schema, and create a private Gitea repo.
 * `ownerId` is taken from the session upstream — never trusted from the client.
 * Response shape stays `ProjectView` (no gitea fields).
 */
export async function createProject(input: CreateProjectInput): Promise<ProjectView> {
  const projectId = crypto.randomUUID();
  const schemaName = generateProjectSchemaName();

  await createProjectSchema(schemaName);

  let gitea: GiteaRepoIdentity | undefined;
  try {
    gitea = await provisionGiteaRepo(projectId, input.name);
    const row = await insertProjectMeta(projectId, schemaName, input, gitea);
    return toView(row);
  } catch (error) {
    await compensateCreateFailure(schemaName, gitea);
    throw error;
  }
}

async function insertProjectMeta(
  projectId: string,
  schemaName: string,
  input: CreateProjectInput,
  gitea: GiteaRepoIdentity,
) {
  return getPublicClient().projectMeta.create({
    data: {
      id: projectId,
      name: input.name,
      description: input.description ?? null,
      schemaName,
      ownerId: input.ownerId,
      status: 'ACTIVE',
      giteaOwner: gitea.owner,
      giteaRepo: gitea.repo,
      giteaDefaultBranch: gitea.defaultBranch,
    },
  });
}

/** Meta failure → deleteRepo + drop schema; Gitea failure → drop schema only. */
async function compensateCreateFailure(
  schemaName: string,
  gitea: GiteaRepoIdentity | undefined,
): Promise<void> {
  if (gitea) {
    await deleteRepo(gitea.owner, gitea.repo).catch(() => {});
  }
  await dropProjectSchema(schemaName).catch(() => {});
}

/**
 * Soft-delete a project: set `deletedAt` and evict the cached project client.
 * Returns `false` if the project does not exist / is already deleted / is not
 * owned by `ownerId`. Schema and Gitea repo are retained for restore.
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
