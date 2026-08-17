/**
 * Gitea repo provisioning for project create. Lazy editor backfill will reuse
 * the same helpers later (Task 2.2). Owner resolution prefers `GITEA_REPO_OWNER`,
 * then the admin login from `/user` (SPEC assumption #16).
 */
import { createRepo, deleteRepo, getAuthenticatedUser, seedUserTemplate } from '@/shared/gitea';

export type GiteaRepoIdentity = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

const DEFAULT_BRANCH = 'main';

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
