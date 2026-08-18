/**
 * Fast-forward a task branch into the project default branch after ACCEPTED.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { buildCloneUrl, cloneRepo, removeWorkDir } from '../deploy/clone';
import { codeWorkDir } from './branch';

const execFileAsync = promisify(execFile);

export type MergeTaskBranchInput = {
  owner: string;
  repo: string;
  defaultBranch: string;
  taskBranch: string;
  taskId: string;
};

/** Clone default branch, FF-only merge of the task branch, push. */
export async function mergeTaskBranch(input: MergeTaskBranchInput): Promise<string> {
  const workDir = `${codeWorkDir(input.taskId)}-merge`;
  try {
    await cloneRepo({
      owner: input.owner,
      repo: input.repo,
      branch: input.defaultBranch,
      workDir,
    });
    const url = buildCloneUrl(input.owner, input.repo);
    await execFileAsync('git', ['fetch', url, input.taskBranch], {
      cwd: workDir,
      timeout: 120_000,
    });
    await execFileAsync('git', ['merge', '--ff-only', 'FETCH_HEAD'], {
      cwd: workDir,
      timeout: 30_000,
    });
    await execFileAsync('git', ['push', 'origin', `HEAD:${input.defaultBranch}`], {
      cwd: workDir,
      timeout: 120_000,
    });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: workDir,
      timeout: 15_000,
    });
    return stdout.trim();
  } finally {
    await removeWorkDir(workDir);
  }
}
