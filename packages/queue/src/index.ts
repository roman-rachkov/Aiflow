/**
 * `@aiflow/queue` — BullMQ queue names, Redis connection, typed producers.
 * Leaf aside from bullmq/ioredis. No dockerode (that stays in `apps/worker`).
 */

export {
  QUEUE_CODE_EXECUTE,
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
