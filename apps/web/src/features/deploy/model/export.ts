/**
 * Export Dockerfile + docker-compose.yml, optionally committing to Gitea.
 * Uses Contents API only — never dockerode.
 */

import {
  createOrUpdateFile,
  getFile,
  isGiteaUpstreamError,
  type GitIdentity,
} from '@/shared/gitea';

import { renderDeployTemplates } from './templates';
import type { DeployContext, ExportResult } from './types';

const COMMIT_MESSAGE = 'chore: add deploy templates (AI Studio)';
const PLATFORM_GIT: GitIdentity = {
  name: 'AI Studio',
  email: 'noreply@aistudio.local',
};

export type ExportOptions = {
  commitToGitea?: boolean;
};

/** Render templates; when `commitToGitea` (default true) write both files to Gitea. */
export async function exportDeployTemplates(
  ctx: DeployContext,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const commitToGitea = options.commitToGitea !== false;
  const rendered = renderDeployTemplates(ctx);
  if (!commitToGitea) {
    return { ...rendered, committed: false };
  }

  const branch = ctx.giteaDefaultBranch;
  const dockerfileSha = await writeFile(ctx, 'Dockerfile', rendered.dockerfile, branch);
  const composeSha = await writeFile(ctx, 'docker-compose.yml', rendered.compose, branch);
  return { ...rendered, committed: true, commitSha: composeSha || dockerfileSha };
}

async function writeFile(
  ctx: DeployContext,
  path: string,
  content: string,
  branch: string,
): Promise<string> {
  const sha = await existingSha(ctx, path, branch);
  const result = await createOrUpdateFile(ctx.giteaOwner, ctx.giteaRepo, path, {
    content,
    message: COMMIT_MESSAGE,
    branch,
    ...(sha ? { sha } : {}),
    author: PLATFORM_GIT,
    committer: PLATFORM_GIT,
  });
  return result.commitSha;
}

async function existingSha(
  ctx: DeployContext,
  path: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const file = await getFile(ctx.giteaOwner, ctx.giteaRepo, path, { ref: branch });
    return file.sha;
  } catch (err) {
    if (isGiteaUpstreamError(err) && err.status === 404) return undefined;
    throw err;
  }
}
