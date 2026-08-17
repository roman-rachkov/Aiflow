/**
 * Enqueue live code:execute for every PENDING task whose HARD deps are DONE.
 */

import { getProjectClient } from '@aiflow/db';

import { enqueueExecute, type CodeContext } from './execute';
import type { EnqueueCodeResult } from './types';

/** PENDING tasks with all HARD prerequisites DONE, sortOrder ascending. */
export async function listReadyTaskIds(schemaName: string): Promise<string[]> {
  const client = getProjectClient(schemaName);
  const pending = await client.task.findMany({
    where: { deletedAt: null, status: 'PENDING' },
    select: { id: true },
    orderBy: { sortOrder: 'asc' },
  });
  if (pending.length === 0) return [];
  const ids = pending.map((row) => row.id);
  const edges = await client.taskDependency.findMany({
    where: { dependentId: { in: ids }, kind: 'HARD' },
    select: { dependentId: true, prerequisite: { select: { status: true, deletedAt: true } } },
  });
  const blocked = new Set<string>();
  for (const edge of edges) {
    if (edge.prerequisite.deletedAt != null) continue;
    if (edge.prerequisite.status !== 'DONE') blocked.add(edge.dependentId);
  }
  return ids.filter((id) => !blocked.has(id));
}

export type EnqueueRunPlanResult = {
  taskIds: string[];
  jobs: EnqueueCodeResult[];
};

/** Live-enqueue currently unblocked PENDING tasks (empty list is success). */
export async function enqueueRunPlan(ctx: CodeContext): Promise<EnqueueRunPlanResult> {
  const taskIds = await listReadyTaskIds(ctx.schemaName);
  const jobs: EnqueueCodeResult[] = [];
  for (const taskId of taskIds) {
    jobs.push(await enqueueExecute(ctx, taskId, false));
  }
  return { taskIds, jobs };
}
