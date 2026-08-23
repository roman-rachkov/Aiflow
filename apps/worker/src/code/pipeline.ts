/**
 * Dry-run + live entry for code:execute (MVP-3 A2 step-encoded pipeline).
 */

import type { CodeExecutePayload } from '@aiflow/queue';

import type { CodeHandlerDeps } from './deps';
import { ATTEMPT_MARKER } from './pipeline-steps';
import type { TaskRow } from './status';

export { failTask } from './pipeline-fail';
export { runLiveSteps as runLive } from './pipeline-live';

/** Dry-run: log planned prompt/diff stub; await confirm (AWAITING_REVIEW). */
export async function runDryRun(
  payload: CodeExecutePayload,
  task: TaskRow,
  branch: string,
  deps: CodeHandlerDeps,
): Promise<void> {
  const stub = [
    '=== dry-run ===',
    `branch: ${branch}`,
    `title: ${task.title}`,
    'planned prompt:',
    task.description,
    'acceptance:',
    task.acceptance,
    'diff: (not executed — confirm to run sandbox)',
  ].join('\n');
  await deps.appendTaskLog(payload.schemaName, payload.taskId, `${stub}\n`);
  await deps.setTaskStatus({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    status: 'AWAITING_REVIEW',
    completedAt: null,
  });
}

/** Mark a new pipeline attempt in TaskLog (fresh claim only). */
export async function markPipelineAttempt(
  schemaName: string,
  taskId: string,
  deps: CodeHandlerDeps,
): Promise<void> {
  await deps.appendTaskLog(schemaName, taskId, `${ATTEMPT_MARKER}\n`);
}
