/**
 * BullMQ queue names. Kept in sync with compose `QUEUES=` so workers can
 * selectively listen without hard-coding strings across packages.
 *
 * BullMQ forbids `:` in queue names (Redis key separator). Use hyphens.
 */

export const QUEUE_SPEC_GENERATE = 'spec-generate' as const;
export const QUEUE_PLAN_GENERATE = 'plan-generate' as const;
export const QUEUE_CODE_EXECUTE = 'code-execute' as const;
export const QUEUE_CODE_REVIEW = 'code-review' as const;
export const QUEUE_DEPLOY_RUN = 'deploy-run' as const;
export const QUEUE_CHAT_RUN = 'chat-run' as const;

/** Platform queues (producer constants + worker discovery). */
export const QUEUE_NAMES = [
  QUEUE_SPEC_GENERATE,
  QUEUE_PLAN_GENERATE,
  QUEUE_CODE_EXECUTE,
  QUEUE_CODE_REVIEW,
  QUEUE_DEPLOY_RUN,
  QUEUE_CHAT_RUN,
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];
