/**
 * Task status + TaskLog helpers for code:execute (soft-delete filtered).
 */

import { getProjectClient } from '@aiflow/db';

export type CodeTaskStatus =
  'PENDING' | 'IN_PROGRESS' | 'AWAITING_REVIEW' | 'DONE' | 'FAILED' | 'CANCELLED';

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  acceptance: string;
  status: CodeTaskStatus;
  branchName: string | null;
  headCommit: string | null;
};

export type RecordTaskGitInput = {
  schemaName: string;
  taskId: string;
  branchName?: string | null;
  headCommit?: string | null;
  mergedAt?: Date | null;
};

const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  acceptance: true,
  status: true,
  branchName: true,
  headCommit: true,
} as const;

/** Statuses allowed to transition into IN_PROGRESS (MVP-3 A1). */
const CLAIM_FROM = ['PENDING', 'AWAITING_REVIEW', 'FAILED'] as const;

/** Load a non-deleted Task or null (includes git checkpoint fields). */
export async function loadTask(schemaName: string, taskId: string): Promise<TaskRow | null> {
  const row = await getProjectClient(schemaName).task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: TASK_SELECT,
  });
  return row;
}

/**
 * Conditional claim: PENDING | AWAITING_REVIEW | FAILED → IN_PROGRESS.
 * Returns false when another worker won the race or status is not claimable.
 */
export async function claimInProgress(input: {
  schemaName: string;
  taskId: string;
  startedAt: Date;
}): Promise<boolean> {
  const result = await getProjectClient(input.schemaName).task.updateMany({
    where: {
      id: input.taskId,
      deletedAt: null,
      status: { in: [...CLAIM_FROM] },
    },
    data: {
      status: 'IN_PROGRESS',
      startedAt: input.startedAt,
      completedAt: null,
      // New attempt — clear prior git checkpoint so resume cannot skip sandbox.
      headCommit: null,
      branchName: null,
      mergedAt: null,
    },
  });
  return result.count === 1;
}

/** Append a TaskLog row (durable checkpoint; Redis is disposable). */
export async function appendTaskLog(
  schemaName: string,
  taskId: string,
  message: string,
  level: 'INFO' | 'WARN' | 'ERROR' = 'INFO',
): Promise<void> {
  await getProjectClient(schemaName).taskLog.create({
    data: { taskId, message, level },
  });
}

/** Chronological TaskLog messages for pipeline step resume (A2). */
export async function listTaskLogMessages(schemaName: string, taskId: string): Promise<string[]> {
  const rows = await getProjectClient(schemaName).taskLog.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    select: { message: true },
  });
  return rows.map((r) => r.message);
}

export type SetTaskStatusInput = {
  schemaName: string;
  taskId: string;
  status: CodeTaskStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

/** Update Task status fields (caller already verified soft-delete). */
export async function setTaskStatus(input: SetTaskStatusInput): Promise<void> {
  const data: {
    status: CodeTaskStatus;
    startedAt?: Date | null;
    completedAt?: Date | null;
  } = { status: input.status };
  if (input.startedAt !== undefined) data.startedAt = input.startedAt;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;
  await getProjectClient(input.schemaName).task.update({
    where: { id: input.taskId },
    data,
  });
}

/** Persist branch / commit / merge timestamp (soft-delete already verified). */
export async function recordTaskGit(input: RecordTaskGitInput): Promise<void> {
  const data: {
    branchName?: string | null;
    headCommit?: string | null;
    mergedAt?: Date | null;
  } = {};
  if (input.branchName !== undefined) data.branchName = input.branchName;
  if (input.headCommit !== undefined) data.headCommit = input.headCommit;
  if (input.mergedAt !== undefined) data.mergedAt = input.mergedAt;
  await getProjectClient(input.schemaName).task.update({
    where: { id: input.taskId },
    data,
  });
}
