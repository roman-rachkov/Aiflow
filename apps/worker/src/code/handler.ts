/**
 * BullMQ handler for `code:execute` — clone, dry-run or sandbox, status/logs.
 * On sandbox success enqueues `code-review` (MVP-2); does not mark DONE here.
 * MVP-3 A1/A2: claim + step-encoded resume (TaskLog checkpoints).
 */

import type { Job } from 'bullmq';
import { ensureTaskGitColumns } from '@aiflow/db';
import { getReviewQueue, validateCodePayload, type CodeExecutePayload } from '@aiflow/queue';

import { cloneRepo, removeWorkDir } from '../deploy/clone';
import { defaultRecordAudit } from '../audit';
import {
  captureBranchDiff,
  checkoutTaskBranch,
  codeWorkDir,
  pushBranch,
  readHeadCommit,
  resolveBranchName,
} from './branch';
import { resolveCodeClaim, type TaskRowWithGit } from './claim';
import type { CodeHandlerDeps } from './deps';
import { pushCheckpointRef, restoreCheckpointCommit } from './git-checkpoint';
import { failTask, markPipelineAttempt, runDryRun, runLive } from './pipeline';
import type { PipelineStep } from './pipeline-steps';
import { runSandboxContainer } from './sandbox-run';
import { ensureUserTemplate } from './seed-template';
import { removeSecretDir, resolveApiKey, writeApiKeySecret } from './secrets';
import {
  appendTaskLog,
  claimInProgress,
  listTaskLogMessages,
  loadTask,
  recordTaskGit,
  setTaskStatus,
} from './status';

export type { CodeHandlerDeps } from './deps';

const defaultDeps: CodeHandlerDeps = {
  loadTask,
  claimInProgress,
  setTaskStatus,
  appendTaskLog,
  listTaskLogMessages,
  cloneRepo,
  ensureUserTemplate,
  checkoutTaskBranch,
  pushBranch,
  pushCheckpointRef,
  restoreCheckpointCommit,
  readHeadCommit,
  recordTaskGit,
  captureBranchDiff,
  enqueueCodeReview: async (payload) => {
    await getReviewQueue().add('code:review', payload);
  },
  recordAudit: defaultRecordAudit,
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
  const claim = await resolveCodeClaim(payload.schemaName, payload.taskId, deps);
  if (claim.kind === 'reject') throw new Error(claim.reason);
  if (claim.kind === 'skip-done') {
    await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Уже DONE — пропуск\n');
    return;
  }
  if (claim.kind === 'pipeline-complete') {
    await deps.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      'Pipeline уже завершён — ожидание review\n',
    );
    return;
  }

  const workDir = codeWorkDir(payload.taskId);
  try {
    await runClaimed(
      {
        payload,
        task: claim.task,
        resumeFrom: claim.resumeFrom,
        freshAttempt: claim.freshAttempt,
        workDir,
      },
      deps,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failTask(payload, `Ошибка выполнения: ${message}`, deps);
    throw err;
  } finally {
    await deps.removeWorkDir(workDir);
  }
}

async function runClaimed(
  args: {
    payload: CodeExecutePayload;
    task: TaskRowWithGit;
    resumeFrom: PipelineStep;
    freshAttempt: boolean;
    workDir: string;
  },
  deps: CodeHandlerDeps,
): Promise<void> {
  const { payload, task, resumeFrom, freshAttempt, workDir } = args;
  if (freshAttempt) {
    await markPipelineAttempt(payload.schemaName, payload.taskId, deps);
    await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Задача взята в работу\n');
  } else {
    await deps.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      `Возобновление pipeline с шага ${resumeFrom}\n`,
    );
  }
  const branch = resolveBranchName(task.id, task.title, payload.branchName);
  if (payload.dryRun) {
    await runDryRun(payload, task, branch, deps);
    return;
  }
  await runLive({ payload, task, branch, workDir, deps, resumeFrom });
}
