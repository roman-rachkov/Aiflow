/**
 * Public surface of the tasks feature slice (Tasks 3.2–3.3).
 * UI lives in `./client` so this barrel stays server-safe.
 */

export type {
  EnqueueCodeResult,
  EnqueuePlanResult,
  TaskDetail,
  TaskLogEntry,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from './model/types';
export {
  CodeConflictError,
  CodeGiteaMissingError,
  CodeTaskNotFoundError,
  CodeWrongStatusError,
  PlanSpecRequiredError,
} from './model/types';
export { assertProCode, assertProPlan } from './model/access';
export type { ProApiUser } from './model/access';
export { enqueuePlan, listTasks } from './model/service';
export type { EnqueuePlanOptions } from './model/service';
export { enqueueConfirm, enqueueExecute, resolveCodeContext } from './model/execute';
export type { CodeContext } from './model/execute';
export { enqueueRunPlan, listReadyTaskIds } from './model/run-plan';
export type { EnqueueRunPlanResult } from './model/run-plan';
export { getTaskDetail } from './model/detail';
export { attachTaskLogsWebSocket, WS_CLOSE_FORBIDDEN } from './model/ws-attach';
