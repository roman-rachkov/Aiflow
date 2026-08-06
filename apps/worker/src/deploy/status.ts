/**
 * Append build log lines and sync Deployment + DeploymentMeta status.
 */

import { getProjectClient, getPublicClient } from '@aiflow/db';

export type DeployStatus = 'BUILDING' | 'DEPLOYED' | 'FAILED';

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

/** Mark Deployment + Meta terminal and optionally append a final log chunk. */
export async function finishDeploy(input: FinishDeployInput): Promise<void> {
  const { schemaName, deploymentId, status } = input;
  const completedAt = new Date();
  const client = getProjectClient(schemaName);

  if (input.logChunk) {
    await appendDeployLog(schemaName, deploymentId, input.logChunk);
  }

  const row = await client.deployment.findFirst({
    where: { id: deploymentId, deletedAt: null },
    select: { log: true },
  });

  await client.deployment.update({
    where: { id: deploymentId },
    data: {
      status,
      completedAt,
      ...(input.imageTag !== undefined ? { imageTag: input.imageTag } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(row ? {} : { log: input.logChunk ?? null }),
    },
  });

  await getPublicClient().deploymentMeta.update({
    where: { id: deploymentId },
    data: {
      status,
      ...(input.url !== undefined ? { url: input.url } : {}),
    },
  });
}
