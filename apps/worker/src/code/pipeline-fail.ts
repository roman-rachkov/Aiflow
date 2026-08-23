/**
 * Fail helper for code:execute pipeline (shared by live steps + handler).
 */

import type { CodeExecutePayload } from '@aiflow/queue';

import type { CodeHandlerDeps } from './deps';

/** Mark FAILED and append error log. */
export async function failTask(
  payload: CodeExecutePayload,
  message: string,
  deps: CodeHandlerDeps,
): Promise<void> {
  await deps.appendTaskLog(payload.schemaName, payload.taskId, message, 'ERROR');
  await deps.setTaskStatus({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    status: 'FAILED',
    completedAt: deps.now(),
  });
}
