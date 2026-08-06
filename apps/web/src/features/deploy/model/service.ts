/**
 * Deployment persistence + enqueue. Next.js is producer-only — no dockerode.
 */

import { randomUUID } from 'node:crypto';

import { getProjectClient, getPublicClient } from '@aiflow/db';
import { getDeployQueue, type DeployRunPayload } from '@aiflow/queue';

import { exportDeployTemplates } from './export';
import {
  DeployConflictError,
  type CreateDeploymentResult,
  type DeployContext,
  type DeploymentDetail,
  type DeploymentSummary,
} from './types';

const INITIAL_LOG = 'Сборка поставлена в очередь\n';

export type CreateDeploymentOptions = {
  exportFirst?: boolean;
};

/** List deployments for a project (no full log), newest first. Soft-delete filtered. */
export async function listDeployments(
  schemaName: string,
  projectId: string,
): Promise<DeploymentSummary[]> {
  const rows = await getProjectClient(schemaName).deployment.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      url: true,
      imageTag: true,
      createdAt: true,
      completedAt: true,
    },
  });
  return rows.map(toSummary);
}

/** Full deployment including log. Soft-delete filtered. */
export async function getDeployment(
  schemaName: string,
  projectId: string,
  deploymentId: string,
): Promise<DeploymentDetail | null> {
  const row = await getProjectClient(schemaName).deployment.findFirst({
    where: { id: deploymentId, projectId, deletedAt: null },
  });
  if (!row) return null;
  return { ...toSummary(row), log: row.log };
}

/**
 * Export templates (default), create paired Deployment/Meta, enqueue deploy:run.
 * Throws DeployConflictError when a BUILDING row already exists.
 */
export async function createDeployment(
  ctx: DeployContext,
  options: CreateDeploymentOptions = {},
): Promise<CreateDeploymentResult> {
  if (options.exportFirst !== false) {
    await exportDeployTemplates(ctx, { commitToGitea: true });
  }
  await assertNoBuilding(ctx);
  const deploymentId = await insertBuildingPair(ctx);
  await enqueueOrFail(ctx, deploymentId);
  return { deploymentId, status: 'BUILDING' };
}

async function assertNoBuilding(ctx: DeployContext): Promise<void> {
  const existing = await getProjectClient(ctx.schemaName).deployment.findFirst({
    where: { projectId: ctx.projectId, status: 'BUILDING', deletedAt: null },
    select: { id: true },
  });
  if (existing) throw new DeployConflictError();
}

async function insertBuildingPair(ctx: DeployContext): Promise<string> {
  const deploymentId = randomUUID();
  const project = getProjectClient(ctx.schemaName);
  await project.deployment.create({
    data: {
      id: deploymentId,
      projectId: ctx.projectId,
      status: 'BUILDING',
      log: INITIAL_LOG,
      url: null,
      imageTag: null,
      deletedAt: null,
    },
  });
  try {
    await getPublicClient().deploymentMeta.create({
      data: {
        id: deploymentId,
        projectId: ctx.projectId,
        status: 'BUILDING',
        url: null,
        deletedAt: null,
      },
    });
  } catch (err) {
    await project.deployment.update({
      where: { id: deploymentId },
      data: {
        status: 'FAILED',
        log: `${INITIAL_LOG}Не удалось создать DeploymentMeta\n`,
        completedAt: new Date(),
      },
    });
    throw err;
  }
  return deploymentId;
}

async function enqueueOrFail(ctx: DeployContext, deploymentId: string): Promise<void> {
  const payload: DeployRunPayload = {
    projectId: ctx.projectId,
    deploymentId,
    schemaName: ctx.schemaName,
    giteaOwner: ctx.giteaOwner,
    giteaRepo: ctx.giteaRepo,
    giteaDefaultBranch: ctx.giteaDefaultBranch,
  };
  try {
    await getDeployQueue().add('deploy:run', payload, { jobId: deploymentId });
  } catch (err) {
    await markEnqueueFailed(ctx.schemaName, deploymentId, err);
    throw err;
  }
}

async function markEnqueueFailed(
  schemaName: string,
  deploymentId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : 'queue error';
  const log = `${INITIAL_LOG}Очередь недоступна: ${message}\n`;
  const completedAt = new Date();
  await getProjectClient(schemaName).deployment.update({
    where: { id: deploymentId },
    data: { status: 'FAILED', log, completedAt },
  });
  await getPublicClient().deploymentMeta.update({
    where: { id: deploymentId },
    data: { status: 'FAILED' },
  });
}

function toSummary(row: {
  id: string;
  status: string;
  url: string | null;
  imageTag: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): DeploymentSummary {
  return {
    id: row.id,
    status: row.status as DeploymentSummary['status'],
    url: row.url,
    imageTag: row.imageTag,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
