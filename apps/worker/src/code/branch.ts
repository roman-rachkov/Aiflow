/**
 * Branch naming and git checkout helpers for code:execute.
 */

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Workdir under WORKER_TEMP_DIR for a code job. */
export function codeWorkDir(taskId: string): string {
  const base = process.env.WORKER_TEMP_DIR ?? '/tmp';
  return join(base, `code-${taskId}`);
}

/** Slug from title for `task/{shortId}-{slug}`. */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'task';
}

/** Resolve branch: payload override or `task/{8}-{slug}`. */
export function resolveBranchName(taskId: string, title: string, override?: string): string {
  if (override && override.trim() !== '') return override.trim();
  return `task/${taskId.slice(0, 8)}-${slugifyTitle(title)}`;
}

/** Create/checkout branch from default (assumes clone already on default). */
export async function checkoutTaskBranch(workDir: string, branchName: string): Promise<void> {
  await execFileAsync('git', ['checkout', '-B', branchName], {
    cwd: workDir,
    timeout: 30_000,
  });
}

/** Push current HEAD to origin (auth already in remote URL from clone). */
export async function pushBranch(workDir: string, branchName: string): Promise<void> {
  await execFileAsync('git', ['push', '-u', 'origin', `HEAD:${branchName}`], {
    cwd: workDir,
    timeout: 120_000,
  });
}
