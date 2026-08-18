/**
 * BullMQ handler for `code:execute` — clone, dry-run or sandbox, status/logs.
 * On sandbox success enqueues `code-review` (MVP-2); does not mark DONE here.
 */

import type { Job } from 'bullmq';
import { ensureTaskGitColumns } from '@aiflow/db';
import { getReviewQueue, validateCodePayload, type CodeExecutePayload } from '@aiflow/queue';

import { cloneRepo, removeWorkDir } from '../deploy/clone';
import {
  captureBranchDiff,
  checkoutTaskBranch,
  codeWorkDir,
  pushBranch,
  readHeadCommit,
  resolveBranchName,
} from './branch';
import type { CodeHandlerDeps } from './deps';
import { failTask, runDryRun, runLive } from './pipeline';
import { runSandboxContainer } from './sandbox-run';
import { ensureUserTemplate } from './seed-template';
import { removeSecretDir, resolveApiKey, writeApiKeySecret } from './secrets';
import { appendTaskLog, loadTask, recordTaskGit, setTaskStatus } from './status';

export type { CodeHandlerDeps } from './deps';

const defaultDeps: CodeHandlerDeps = {
  loadTask,
  setTaskStatus,
  appendTaskLog,
  cloneRepo,
  ensureUserTemplate,
  checkoutTaskBranch,
  pushBranch,
  readHeadCommit,
  recordTaskGit,
  captureBranchDiff,
  enqueueCodeReview: async (payload) => {
    await getReviewQueue().add('code:review', payload);
  },
  removeWorkDir,
  resolveApiKey,
  writeApiKeySecret,
  removeSecretDir,
  runSandboxContainer,
  now: () => new Date(),
};

/** Process one code:execute job. Exported for unit tests with mocked deps. */
export async function handleCodeExecute(
  job: Job<CodeExecutePayload>,
  deps: CodeHandlerDeps = defaultDeps,
): Promise<void> {
  const payload = job.data;
  validateCodePayload(payload);
  await ensureTaskGitColumns(payload.schemaName);
  const task = await deps.loadTask(payload.schemaName, payload.taskId);
  if (!task) throw new Error(`Task not found: ${payload.taskId}`);

  await markInProgress(payload, deps);
  const branch = resolveBranchName(task.id, task.title, payload.branchName);
  const workDir = codeWorkDir(payload.taskId);

  try {
    if (payload.dryRun) {
      await runDryRun(payload, task, branch, deps);
      return;
    }
    await runLive({ payload, task, branch, workDir, deps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failTask(payload, `Ошибка выполнения: ${message}`, deps);
    throw err;
  } finally {
    await deps.removeWorkDir(workDir);
  }
}

async function markInProgress(payload: CodeExecutePayload, deps: CodeHandlerDeps): Promise<void> {
  await deps.setTaskStatus({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    status: 'IN_PROGRESS',
    startedAt: deps.now(),
    completedAt: null,
  });
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Задача взята в работу\n');
}
