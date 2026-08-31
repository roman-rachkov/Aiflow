/**
 * Append build log lines and sync Deployment + DeploymentMeta status.
 */

import { getProjectClient, getPublicClient } from '@aiflow/db';

export type DeployStatus = 'BUILDING' | 'DEPLOYED' | 'FAILED';

/** Load a non-deleted Deployment summary for claim checks (MVP-3 A1). */
export async function loadDeployment(
  schemaName: string,
  deploymentId: string,
): Promise<{
  id: string;
  status: DeployStatus;
  imageTag: string | null;
  url: string | null;
} | null> {
  return getProjectClient(schemaName).deployment.findFirst({
    where: { id: deploymentId, deletedAt: null },
    select: { id: true, status: true, imageTag: true, url: true },
  });
}

export async function appendDeployLog(
  schemaName: string,
  deploymentId: string,
  chunk: string,
): Promise<void> {
  const client = getProjectClient(schemaName);
  const row = await client.deployment.findFirst({
    where: { id: deploymentId, deletedAt: null },
    select: { log: true },
  });
  if (!row) return;
  await client.deployment.update({
    where: { id: deploymentId },
    data: { log: `${row.log ?? ''}${chunk}` },
  });
}

export type FinishDeployInput = {
  schemaName: string;
  deploymentId: string;
  status: Exclude<DeployStatus, 'BUILDING'>;
  logChunk?: string;
  imageTag?: string | null;
  url?: string | null;
};

/**
 * Mark Deployment + Meta terminal only from BUILDING (MVP-3 A1 dedup).
 * Returns false when already terminal — second finish is a no-op.
 */
export async function finishDeploy(input: FinishDeployInput): Promise<boolean> {
  const { schemaName, deploymentId, status } = input;
  const completedAt = new Date();
  const client = getProjectClient(schemaName);

  if (input.logChunk) {
    await appendDeployLog(schemaName, deploymentId, input.logChunk);
  }

  const result = await client.deployment.updateMany({
    where: { id: deploymentId, deletedAt: null, status: 'BUILDING' },
    data: {
      status,
      completedAt,
      ...(input.imageTag !== undefined ? { imageTag: input.imageTag } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
    },
  });
  if (result.count === 0) return false;

  await getPublicClient().deploymentMeta.updateMany({
    where: { id: deploymentId, deletedAt: null, status: 'BUILDING' },
    data: {
      status,
      ...(input.url !== undefined ? { url: input.url } : {}),
    },
  });
  return true;
}
