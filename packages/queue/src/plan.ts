import { Queue, type DefaultJobOptions } from 'bullmq';

import { createRedisConnection } from './connection';
import { QUEUE_PLAN_GENERATE } from './names';

/**
 * Payload for `plan:generate`. `specificationId` is the project-schema
 * Specification row; `specificationVersion` is denormalized for logs/UI.
 */
export type PlanGeneratePayload = {
  projectId: string;
  schemaName: string;
  specificationId: string;
  specificationVersion: number;
};

/**
 * Plan jobs: a few attempts for Redis/transient LLM blips; parse retries live
 * inside the handler (C3), not as BullMQ re-runs of a bad parse.
 */
export const PLAN_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 2,
  removeOnComplete: 50,
  removeOnFail: 50,
};

let planQueue: Queue<PlanGeneratePayload> | undefined;

/** Producer-only queue accessor. App never runs workers from this package. */
export function getPlanQueue(): Queue<PlanGeneratePayload> {
  planQueue ??= new Queue<PlanGeneratePayload>(QUEUE_PLAN_GENERATE, {
    connection: createRedisConnection(),
    defaultJobOptions: PLAN_JOB_OPTIONS,
  });
  return planQueue;
}

/** Test / shutdown helper — clears the singleton. */
export async function closePlanQueue(): Promise<void> {
  if (!planQueue) return;
  await planQueue.close();
  planQueue = undefined;
}
