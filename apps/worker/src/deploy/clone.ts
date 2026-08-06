/**
 * Clone a Gitea repo into a temp directory for docker build context.
 */

import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function deployWorkDir(deploymentId: string): string {
  const base = process.env.WORKER_TEMP_DIR ?? '/tmp';
  return join(base, `deploy-${deploymentId}`);
}

/** Build `http://oauth2:TOKEN@host/owner/repo.git` from GITEA_* env. */
export function buildCloneUrl(owner: string, repo: string): string {
  const token = process.env.GITEA_ADMIN_TOKEN;
  if (!token) throw new Error('GITEA_ADMIN_TOKEN is not set');
  const raw = (process.env.GITEA_URL ?? 'http://gitea:3000').replace(/\/$/, '');
  const withAuth = raw.replace(/^(https?:\/\/)/, `$1oauth2:${encodeURIComponent(token)}@`);
  return `${withAuth}/${owner}/${repo}.git`;
}

/** Shallow clone into workDir; removes any previous directory first. */
export async function cloneRepo(args: {
  owner: string;
  repo: string;
  branch: string;
  workDir: string;
}): Promise<void> {
  await rm(args.workDir, { recursive: true, force: true });
  await mkdir(args.workDir, { recursive: true });
  const url = buildCloneUrl(args.owner, args.repo);
  await execFileAsync(
    'git',
    ['clone', '--depth', '1', '--branch', args.branch, url, args.workDir],
    { timeout: 120_000 },
  );
}

export async function removeWorkDir(workDir: string): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
}
