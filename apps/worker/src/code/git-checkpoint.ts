/**
 * Durable git checkpoint refs for code:execute resume (MVP-3 A2).
 * Survives workDir wipe after PARSE so PUSH can re-run without re-sandbox.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { checkpointRefName } from './pipeline-steps';

const execFileAsync = promisify(execFile);

/** Push HEAD to `refs/aistudio/task/{taskId}` (idempotent update). */
export async function pushCheckpointRef(workDir: string, taskId: string): Promise<void> {
  const ref = checkpointRefName(taskId);
  await execFileAsync('git', ['push', '-f', 'origin', `HEAD:${ref}`], {
    cwd: workDir,
    timeout: 120_000,
  });
}

/**
 * After shallow clone of default branch: fetch checkpoint ref and reset to SHA.
 */
export async function restoreCheckpointCommit(
  workDir: string,
  taskId: string,
  headCommit: string,
): Promise<void> {
  const ref = checkpointRefName(taskId);
  await execFileAsync('git', ['fetch', '--depth', '1', 'origin', `+${ref}:${ref}`], {
    cwd: workDir,
    timeout: 120_000,
  });
  await execFileAsync('git', ['checkout', '-f', headCommit], {
    cwd: workDir,
    timeout: 30_000,
  });
}
