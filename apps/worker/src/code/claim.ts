/**
 * Idempotent claim for code:execute (MVP-3 A1 + A2 step resume).
 * IN_PROGRESS only from PENDING | AWAITING_REVIEW | FAILED;
 * stalled IN_PROGRESS resumes at first unfinished pipeline step.
 */

import { firstUnfinishedStep, parseCompletedSteps, type PipelineStep } from './pipeline-steps';
import type { CodeTaskStatus, TaskRow } from './status';

export type TaskRowWithGit = TaskRow & {
  branchName: string | null;
  headCommit: string | null;
};

export type CodeClaim =
  | { kind: 'run'; task: TaskRowWithGit; resumeFrom: PipelineStep; freshAttempt: boolean }
  | { kind: 'pipeline-complete'; task: TaskRowWithGit }
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
  listTaskLogMessages: (schemaName: string, taskId: string) => Promise<string[]>;
  now: () => Date;
};

/** Decide whether to run (with resume step), skip, or reject. */
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
    return resumeClaim(schemaName, task, deps);
  }
  if (!CLAIMABLE.includes(task.status)) {
    return { kind: 'reject', reason: `Cannot claim from ${task.status}` };
  }
  const claimed = await deps.claimInProgress({
    schemaName,
    taskId,
    startedAt: deps.now(),
  });
  if (claimed) {
    return { kind: 'run', task, resumeFrom: 'CLONE', freshAttempt: true };
  }
  const again = await deps.loadTask(schemaName, taskId);
  if (!again) return { kind: 'reject', reason: `Task not found: ${taskId}` };
  if (again.status === 'DONE') return { kind: 'skip-done', task: again };
  if (again.status === 'IN_PROGRESS') return resumeClaim(schemaName, again, deps);
  return { kind: 'reject', reason: `Claim race: status=${again.status}` };
}

async function resumeClaim(
  schemaName: string,
  task: TaskRowWithGit,
  deps: ClaimDeps,
): Promise<CodeClaim> {
  const messages = await deps.listTaskLogMessages(schemaName, task.id);
  const completed = parseCompletedSteps(messages);
  const resumeFrom = firstUnfinishedStep(completed, task.headCommit);
  if (resumeFrom === 'COMPLETE') return { kind: 'pipeline-complete', task };
  return { kind: 'run', task, resumeFrom, freshAttempt: false };
}
