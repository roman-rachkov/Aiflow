/**
 * Enqueue live code:execute for PENDING tasks whose HARD deps are all DONE.
 */

import { getProjectClient, getPublicClient } from '@aiflow/db';
import { getCodeQueue, type CodeExecutePayload } from '@aiflow/queue';

type ReadyCtx = {
  projectId: string;
  schemaName: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/** Task ids ready to run (PENDING, HARD prerequisites DONE). */
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

/** Load Gitea identity for a project; null if missing. */
export async function loadReadyCtx(projectId: string): Promise<ReadyCtx | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      schemaName: true,
      giteaOwner: true,
      giteaRepo: true,
      giteaDefaultBranch: true,
    },
  });
  if (!meta?.giteaOwner || !meta.giteaRepo) return null;
  return {
    projectId: meta.id,
    schemaName: meta.schemaName,
    giteaOwner: meta.giteaOwner,
    giteaRepo: meta.giteaRepo,
    giteaDefaultBranch: meta.giteaDefaultBranch || 'main',
  };
}

/** Enqueue live runs for currently unblocked PENDING tasks. */
export async function enqueueReadyTasks(projectId: string, schemaName: string): Promise<string[]> {
  const ctx = await loadReadyCtx(projectId);
  if (!ctx || ctx.schemaName !== schemaName) return [];
  const ready = await listReadyTaskIds(schemaName);
  for (const taskId of ready) {
    await enqueueLive(ctx, taskId);
  }
  return ready;
}

async function enqueueLive(ctx: ReadyCtx, taskId: string): Promise<void> {
  const payload: CodeExecutePayload = {
    projectId: ctx.projectId,
    schemaName: ctx.schemaName,
    taskId,
    giteaOwner: ctx.giteaOwner,
    giteaRepo: ctx.giteaRepo,
    giteaDefaultBranch: ctx.giteaDefaultBranch,
    dryRun: false,
  };
  const jobId = `code-${taskId}-run-${String(Date.now())}`;
  await getCodeQueue().add('code:execute', payload, { jobId });
}
