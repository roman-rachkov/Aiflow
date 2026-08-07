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
};

/** Load a non-deleted Task or null. */
export async function loadTask(schemaName: string, taskId: string): Promise<TaskRow | null> {
  const row = await getProjectClient(schemaName).task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      acceptance: true,
      status: true,
    },
  });
  return row;
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
