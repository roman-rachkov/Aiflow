/**
 * Enqueue code:execute (dry-run or live). Next.js is producer-only.
 */

import { getProjectClient, getPublicClient } from '@aiflow/db';
import { getCodeQueue, type CodeExecutePayload } from '@aiflow/queue';

import {
  CodeConflictError,
  CodeGiteaMissingError,
  CodeTaskNotFoundError,
  CodeWrongStatusError,
  type EnqueueCodeResult,
  type TaskStatus,
} from './types';

export type CodeContext = {
  projectId: string;
  schemaName: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/** Load owned project + Gitea identity; null if missing/foreign. */
export async function resolveCodeContext(
  projectId: string,
  ownerId: string,
): Promise<CodeContext | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      schemaName: true,
      giteaOwner: true,
      giteaRepo: true,
      giteaDefaultBranch: true,
    },
  });
  if (!meta || meta.ownerId !== ownerId) return null;
  if (!meta.giteaOwner || !meta.giteaRepo) throw new CodeGiteaMissingError();
  return {
    projectId: meta.id,
    schemaName: meta.schemaName,
    giteaOwner: meta.giteaOwner,
    giteaRepo: meta.giteaRepo,
    giteaDefaultBranch: meta.giteaDefaultBranch || 'main',
  };
}

/** Dry-run or direct execute from PENDING/FAILED. */
export async function enqueueExecute(
  ctx: CodeContext,
  taskId: string,
  dryRun: boolean,
): Promise<EnqueueCodeResult> {
  const task = await requireTask(ctx.schemaName, taskId);
  assertExecutable(task.status, dryRun);
  return enqueueCodeJob(ctx, taskId, dryRun);
}

/** Confirm after dry-run (AWAITING_REVIEW → live execute). */
export async function enqueueConfirm(ctx: CodeContext, taskId: string): Promise<EnqueueCodeResult> {
  const task = await requireTask(ctx.schemaName, taskId);
  if (task.status !== 'AWAITING_REVIEW') {
    throw new CodeWrongStatusError('Подтверждение доступно после dry-run');
  }
  return enqueueCodeJob(ctx, taskId, false);
}

async function requireTask(
  schemaName: string,
  taskId: string,
): Promise<{ id: string; status: TaskStatus }> {
  const row = await getProjectClient(schemaName).task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!row) throw new CodeTaskNotFoundError();
  return { id: row.id, status: row.status };
}

function assertExecutable(status: TaskStatus, dryRun: boolean): void {
  if (status === 'IN_PROGRESS') throw new CodeConflictError();
  if (dryRun) {
    if (status !== 'PENDING' && status !== 'FAILED' && status !== 'AWAITING_REVIEW') {
      throw new CodeWrongStatusError('Dry-run доступен для ожидающих или ошибочных задач');
    }
    return;
  }
  if (status !== 'PENDING' && status !== 'FAILED') {
    throw new CodeWrongStatusError('Запуск доступен для ожидающих или ошибочных задач');
  }
}

async function enqueueCodeJob(
  ctx: CodeContext,
  taskId: string,
  dryRun: boolean,
): Promise<EnqueueCodeResult> {
  const payload: CodeExecutePayload = {
    projectId: ctx.projectId,
    schemaName: ctx.schemaName,
    taskId,
    giteaOwner: ctx.giteaOwner,
    giteaRepo: ctx.giteaRepo,
    giteaDefaultBranch: ctx.giteaDefaultBranch,
    dryRun,
  };
  const jobId = `code-${taskId}-${dryRun ? 'dry' : 'run'}-${String(Date.now())}`;
  await getCodeQueue().add('code:execute', payload, { jobId });
  return { jobId, taskId, dryRun };
}
