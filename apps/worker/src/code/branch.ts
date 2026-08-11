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

/** Max chars for review payload diffs (Redis/BullMQ payload budget). */
export const MAX_REVIEW_DIFF_CHARS = 180_000;

/**
 * Diff of HEAD against `baseBranch` (three-dot). Truncates oversized output.
 * After Aider commit, working-tree `git diff` is empty — this is the review input.
 */
export async function captureBranchDiff(workDir: string, baseBranch: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['diff', `${baseBranch}...HEAD`, '--', '.', ':!node_modules', ':!.next'],
    { cwd: workDir, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
  );
  if (stdout.length <= MAX_REVIEW_DIFF_CHARS) return stdout;
  return `${stdout.slice(0, MAX_REVIEW_DIFF_CHARS)}\n\n… [diff truncated]\n`;
}
