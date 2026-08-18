/**
 * Lazy Gitea repo provision for editor backfill (SPEC: first editor access when
 * ProjectMeta.gitea* are null). Mirrors projects create-saga helpers via
 * `@/shared/gitea` — projects internals are not importable across FSD slices.
 */
import { getPublicClient } from '@aiflow/db';
import { createRepo, deleteRepo, getAuthenticatedUser, seedUserTemplate } from '@/shared/gitea';

import type { GiteaRepoIdentity } from './types';

const DEFAULT_BRANCH = 'main';

/** In-process mutex: one lazy provision per projectId at a time. */
const locks = new Map<string, Promise<unknown>>();

/** Repo name derived from project id: `project-{uuidWithoutHyphens}`. */
export function giteaRepoNameFromProjectId(projectId: string): string {
  return `project-${projectId.replaceAll('-', '')}`;
}

/** Env owner, or authenticated admin login when unset/empty. */
export async function resolveGiteaOwner(): Promise<string> {
  const fromEnv = process.env.GITEA_REPO_OWNER?.trim();
  if (fromEnv) return fromEnv;
  const user = await getAuthenticatedUser();
  return user.login;
}

/**
 * Private repo + user-nextjs scaffold on `main`. If seed fails after createRepo,
 * the repo is deleted before the error is rethrown.
 */
export async function provisionGiteaRepo(
  projectId: string,
  projectName: string,
): Promise<GiteaRepoIdentity> {
  const owner = await resolveGiteaOwner();
  const repo = giteaRepoNameFromProjectId(projectId);
  await createRepoAligned(owner, repo, projectName);
  try {
    await seedUserTemplate({ owner, repo, projectName, branch: DEFAULT_BRANCH });
  } catch (error) {
    await deleteRepo(owner, repo).catch(() => {});
    throw error;
  }
  return { owner, repo, defaultBranch: DEFAULT_BRANCH };
}

/**
 * Ensure ProjectMeta has gitea fields: create repo once under a per-project
 * lock, then conditional update so concurrent callers share one identity.
 */
export async function ensureGiteaProvisioned(
  projectId: string,
  projectName: string,
): Promise<GiteaRepoIdentity> {
  return withProjectLock(projectId, async () => {
    const existing = await readGiteaIdentity(projectId);
    if (existing) return existing;

    const identity = await provisionGiteaRepo(projectId, projectName);
    const filled = await backfillGiteaFields(projectId, identity);
    if (filled) return identity;

    await deleteRepo(identity.owner, identity.repo).catch(() => {});
    const winner = await readGiteaIdentity(projectId);
    if (winner) return winner;
    throw new Error(`Gitea backfill lost race for project ${projectId}`);
  });
}

async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  locks.set(projectId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(projectId) === chained) locks.delete(projectId);
  }
}

async function readGiteaIdentity(projectId: string): Promise<GiteaRepoIdentity | null> {
  const row = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { giteaOwner: true, giteaRepo: true, giteaDefaultBranch: true },
  });
  if (!row?.giteaOwner || !row.giteaRepo) return null;
  return {
    owner: row.giteaOwner,
    repo: row.giteaRepo,
    defaultBranch: row.giteaDefaultBranch,
  };
}

/** Returns true when this caller won the conditional update. */
async function backfillGiteaFields(
  projectId: string,
  identity: GiteaRepoIdentity,
): Promise<boolean> {
  const result = await getPublicClient().projectMeta.updateMany({
    where: {
      id: projectId,
      deletedAt: null,
      giteaOwner: null,
      giteaRepo: null,
    },
    data: {
      giteaOwner: identity.owner,
      giteaRepo: identity.repo,
      giteaDefaultBranch: identity.defaultBranch,
    },
  });
  return result.count === 1;
}

/** createRepo reads owner from env; sync when we resolved via `/user`. */
async function createRepoAligned(owner: string, repo: string, projectName: string): Promise<void> {
  const prev = process.env.GITEA_REPO_OWNER;
  const hadOwner = Boolean(prev?.trim());
  if (!hadOwner) process.env.GITEA_REPO_OWNER = owner;
  try {
    await createRepo({
      name: repo,
      private: true,
      defaultBranch: DEFAULT_BRANCH,
      description: projectName,
    });
  } finally {
    if (!hadOwner) {
      if (prev === undefined) delete process.env.GITEA_REPO_OWNER;
      else process.env.GITEA_REPO_OWNER = prev;
    }
  }
}
