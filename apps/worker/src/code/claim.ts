/**
 * Idempotent claim for code:execute (MVP-3 A1).
 * IN_PROGRESS only from PENDING | AWAITING_REVIEW | FAILED;
 * stalled IN_PROGRESS resumes; DONE / post-push skips re-work.
 */

import type { CodeTaskStatus, TaskRow } from './status';

export type TaskRowWithGit = TaskRow & {
  branchName: string | null;
  headCommit: string | null;
};

export type CodeClaim =
  | { kind: 'run'; task: TaskRowWithGit }
  | { kind: 'resume-after-push'; task: TaskRowWithGit & { headCommit: string } }
  | { kind: 'skip-done'; task: TaskRowWithGit }
  | { kind: 'reject'; reason: string };

const CLAIMABLE: CodeTaskStatus[] = ['PENDING', 'AWAITING_REVIEW', 'FAILED'];

export type ClaimDeps = {
  loadTask: (schemaName: string, taskId: string) => Promise<TaskRowWithGit | null>;
  claimInProgress: (input: {
    schemaName: string;
    taskId: string;
    startedAt: Date;
  }) => Promise<boolean>;
  now: () => Date;
};

/** Decide whether to run, resume after push, skip, or reject. */
export async function resolveCodeClaim(
  schemaName: string,
  taskId: string,
  deps: ClaimDeps,
): Promise<CodeClaim> {
  const task = await deps.loadTask(schemaName, taskId);
  if (!task) return { kind: 'reject', reason: `Task not found: ${taskId}` };
  if (task.status === 'DONE') return { kind: 'skip-done', task };
  if (task.status === 'CANCELLED') {
    return { kind: 'reject', reason: 'Task is CANCELLED' };
  }
  if (task.status === 'IN_PROGRESS') {
    return resumeOrRun(task);
  }
  if (!CLAIMABLE.includes(task.status)) {
    return { kind: 'reject', reason: `Cannot claim from ${task.status}` };
  }
  const claimed = await deps.claimInProgress({
    schemaName,
    taskId,
    startedAt: deps.now(),
  });
  if (claimed) return { kind: 'run', task };
  const again = await deps.loadTask(schemaName, taskId);
  if (!again) return { kind: 'reject', reason: `Task not found: ${taskId}` };
  if (again.status === 'DONE') return { kind: 'skip-done', task: again };
  if (again.status === 'IN_PROGRESS') return resumeOrRun(again);
  return { kind: 'reject', reason: `Claim race: status=${again.status}` };
}

function resumeOrRun(task: TaskRowWithGit): CodeClaim {
  if (task.headCommit) {
    return { kind: 'resume-after-push', task: { ...task, headCommit: task.headCommit } };
  }
  return { kind: 'run', task };
}
