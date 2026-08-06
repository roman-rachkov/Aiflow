/**
 * BullMQ queue names. Kept in sync with compose `QUEUES=` so workers can
 * selectively listen without hard-coding strings across packages.
 */

export const QUEUE_SPEC_GENERATE = 'spec:generate' as const;
export const QUEUE_PLAN_GENERATE = 'plan:generate' as const;
export const QUEUE_CODE_EXECUTE = 'code:execute' as const;
export const QUEUE_DEPLOY_RUN = 'deploy:run' as const;

/** All four platform queues (producer constants + worker discovery). */
export const QUEUE_NAMES = [
  QUEUE_SPEC_GENERATE,
  QUEUE_PLAN_GENERATE,
  QUEUE_CODE_EXECUTE,
  QUEUE_DEPLOY_RUN,
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
