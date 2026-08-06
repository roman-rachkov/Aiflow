import { Queue, type DefaultJobOptions } from 'bullmq';

import { createRedisConnection } from './connection';
import { QUEUE_DEPLOY_RUN } from './names';

/**
 * Payload for `deploy:run`. `deploymentId` is shared by project-schema
 * `Deployment` and public `DeploymentMeta` (same uuid).
 */
export type DeployRunPayload = {
  projectId: string;
  deploymentId: string;
  schemaName: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/**
 * Deploy builds fail-fast: `attempts: 1` so Docker/build errors do not loop.
 * Infra flakiness is left to the operator (re-enqueue via UI), not silent retries.
 */
export const DEPLOY_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 1,
  removeOnComplete: 50,
  removeOnFail: 50,
};

let deployQueue: Queue<DeployRunPayload> | undefined;

/** Producer-only queue accessor. App never runs workers from this package. */
export function getDeployQueue(): Queue<DeployRunPayload> {
  deployQueue ??= new Queue<DeployRunPayload>(QUEUE_DEPLOY_RUN, {
    connection: createRedisConnection(),
    defaultJobOptions: DEPLOY_JOB_OPTIONS,
  });
  return deployQueue;
}

/** Test / shutdown helper — clears the singleton. */
export async function closeDeployQueue(): Promise<void> {
  if (!deployQueue) return;
  await deployQueue.close();
  deployQueue = undefined;
}
