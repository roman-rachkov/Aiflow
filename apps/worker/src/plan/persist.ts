/**
 * Persist planner output: soft-delete replaceable tasks, insert Task rows,
 * TaskDependency edges (by title), and TaskLog entries.
 */

import type { PlanTask, PlanTaskPriority } from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';

const REPLACEABLE = ['PENDING', 'FAILED', 'CANCELLED'] as const;

const PRIORITY_MAP: Record<PlanTaskPriority, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export type PersistPlanInput = {
  schemaName: string;
  specificationId: string;
  plan: PlanTask[];
};

export type PersistPlanResult = {
  taskIds: string[];
  replacedCount: number;
};

type ProjectDb = ReturnType<typeof getProjectClient>;

/** Soft-delete PENDING/FAILED/CANCELLED tasks for a specification; keep active. */
export async function softDeleteReplaceableTasks(
  client: ProjectDb,
  specificationId: string,
): Promise<number> {
  const now = new Date();
  const result = await client.task.updateMany({
    where: {
      specificationId,
      deletedAt: null,
      status: { in: [...REPLACEABLE] },
    },
    data: { deletedAt: now },
  });
  return result.count;
}

/** Insert tasks, HARD deps by title, and an INFO log per task. */
export async function persistPlanTasks(input: PersistPlanInput): Promise<PersistPlanResult> {
  const client = getProjectClient(input.schemaName);
  const replacedCount = await softDeleteReplaceableTasks(client, input.specificationId);
  const titleToId = new Map<string, string>();
  const taskIds: string[] = [];

  for (let i = 0; i < input.plan.length; i += 1) {
    const item = input.plan[i];
    const row = await client.task.create({
      data: {
        title: item.title,
        description: item.description,
        acceptance: item.acceptance,
        status: 'PENDING',
        priority: PRIORITY_MAP[item.priority],
        sortOrder: i,
        specificationId: input.specificationId,
      },
    });
    titleToId.set(item.title, row.id);
    taskIds.push(row.id);
    await client.taskLog.create({
      data: {
        taskId: row.id,
        message: `Task created by Planner (sortOrder=${String(i)})`,
        level: 'INFO',
      },
    });
  }

  await createDependencies(client, input.plan, titleToId);
  return { taskIds, replacedCount };
}

async function createDependencies(
  client: ProjectDb,
  plan: PlanTask[],
  titleToId: Map<string, string>,
): Promise<void> {
  for (const item of plan) {
    const dependentId = titleToId.get(item.title);
    if (!dependentId) continue;
    for (const depTitle of item.dependencies) {
      const prerequisiteId = titleToId.get(depTitle);
      if (!prerequisiteId || prerequisiteId === dependentId) continue;
      await client.taskDependency.create({
        data: { dependentId, prerequisiteId, kind: 'HARD' },
      });
    }
  }
}
