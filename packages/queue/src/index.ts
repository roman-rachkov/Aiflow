/**
 * `@aiflow/queue` — BullMQ queue names, Redis connection, typed producers.
 * Leaf aside from bullmq/ioredis. No dockerode (that stays in `apps/worker`).
 */

export {
  QUEUE_CHAT_RUN,
  QUEUE_CODE_EXECUTE,
  QUEUE_CODE_REVIEW,
  QUEUE_DEPLOY_RUN,
  QUEUE_NAMES,
  QUEUE_PLAN_GENERATE,
  QUEUE_SPEC_GENERATE,
  type QueueName,
} from './names';
export { createRedisConnection } from './connection';
export {
  closeDeployQueue,
  DEPLOY_JOB_OPTIONS,
  getDeployQueue,
  type DeployRunPayload,
} from './deploy';
export { closePlanQueue, getPlanQueue, PLAN_JOB_OPTIONS, type PlanGeneratePayload } from './plan';
export {
  closeCodeQueue,
  CODE_JOB_OPTIONS,
  getCodeQueue,
  sandboxLogsChannel,
  validateCodePayload,
  type CodeExecutePayload,
} from './code';
export {
  closeReviewQueue,
  getReviewQueue,
  REVIEW_JOB_OPTIONS,
  validateReviewPayload,
  type CodeReviewPayload,
} from './review';
export {
  CHAT_JOB_OPTIONS,
  chatRunChannel,
  closeChatRunQueue,
  getChatRunQueue,
  validateChatRunPayload,
  type ChatRunPayload,
} from './chat';
