/**
 * BullMQ handler for `code:execute` — clone, dry-run or sandbox, status/logs.
 * On sandbox success enqueues `code-review` (MVP-2); does not mark DONE here.
 * MVP-3 A1: claim/resume guards so at-least-once delivery has one effect.
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
import { resolveCodeClaim, type TaskRowWithGit } from './claim';
import type { CodeHandlerDeps } from './deps';
import { failTask, runDryRun, runLive } from './pipeline';
import { runSandboxContainer } from './sandbox-run';
import { ensureUserTemplate } from './seed-template';
import { removeSecretDir, resolveApiKey, writeApiKeySecret } from './secrets';
import { appendTaskLog, claimInProgress, loadTask, recordTaskGit, setTaskStatus } from './status';

export type { CodeHandlerDeps } from './deps';

const defaultDeps: CodeHandlerDeps = {
  loadTask,
  claimInProgress,
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
  const claim = await resolveCodeClaim(payload.schemaName, payload.taskId, deps);
  if (claim.kind === 'reject') throw new Error(claim.reason);
  if (claim.kind === 'skip-done') {
    await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Уже DONE — пропуск\n');
    return;
  }

  const workDir = codeWorkDir(payload.taskId);
  try {
    if (claim.kind === 'resume-after-push') {
      await resumeAfterPush(payload, claim.task, workDir, deps);
      return;
    }
    await runClaimed(payload, claim.task, workDir, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failTask(payload, `Ошибка выполнения: ${message}`, deps);
    throw err;
  } finally {
    await deps.removeWorkDir(workDir);
  }
}

async function runClaimed(
  payload: CodeExecutePayload,
  task: TaskRowWithGit,
  workDir: string,
  deps: CodeHandlerDeps,
): Promise<void> {
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Задача взята в работу\n');
  const branch = resolveBranchName(task.id, task.title, payload.branchName);
  if (payload.dryRun) {
    await runDryRun(payload, task, branch, deps);
    return;
  }
  await runLive({ payload, task, branch, workDir, deps });
}

/** Crash after headCommit recorded: clone, push (idempotent), re-enqueue review. */
async function resumeAfterPush(
  payload: CodeExecutePayload,
  task: TaskRowWithGit & { headCommit: string },
  workDir: string,
  deps: CodeHandlerDeps,
): Promise<void> {
  const branch = task.branchName ?? resolveBranchName(task.id, task.title, payload.branchName);
  await deps.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    'Возобновление после сбоя: ветка уже записана, повтор push/review…\n',
  );
  await deps.cloneRepo({
    owner: payload.giteaOwner,
    repo: payload.giteaRepo,
    branch: payload.giteaDefaultBranch,
    workDir,
  });
  await deps.checkoutTaskBranch(workDir, branch);
  await deps.pushBranch(workDir, branch);
  const diff = await deps.captureBranchDiff(workDir, payload.giteaDefaultBranch);
  await deps.enqueueCodeReview({
    projectId: payload.projectId,
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    branchName: branch,
    diff,
    checks: { typescript: true, eslint: true, tests: null },
  });
  await deps.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    'Повторный enqueue code-review после resume\n',
  );
}
