/**
 * Task detail + TaskLog reads (soft-delete filtered).
 */

import { getProjectClient } from '@aiflow/db';

import type { TaskDetail, TaskLogEntry } from './types';

/** Full task + recent logs for the log panel. */
export async function getTaskDetail(
  schemaName: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const row = await getProjectClient(schemaName).task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      acceptance: true,
      status: true,
      priority: true,
      sortOrder: true,
      specificationId: true,
      createdAt: true,
      dependsOn: {
        select: { prerequisite: { select: { title: true, deletedAt: true } } },
      },
      logs: {
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: { id: true, message: true, level: true, createdAt: true },
      },
    },
  });
  if (!row) return null;
  const dependencyTitles = row.dependsOn
    .filter((d) => d.prerequisite.deletedAt == null)
    .map((d) => d.prerequisite.title);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    acceptance: row.acceptance,
    status: row.status,
    priority: row.priority,
    sortOrder: row.sortOrder,
    specificationId: row.specificationId,
    dependencyTitles,
    createdAt: row.createdAt.toISOString(),
    logs: row.logs.map(toLog),
  };
}

function toLog(row: { id: string; message: string; level: string; createdAt: Date }): TaskLogEntry {
  return {
    id: row.id,
    message: row.message,
    level: row.level as TaskLogEntry['level'],
    createdAt: row.createdAt.toISOString(),
  };
}
