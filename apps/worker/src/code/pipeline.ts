/**
 * Dry-run and live sandbox pipelines for code:execute.
 * Live success enqueues `code-review` (MVP-2) instead of marking DONE.
 */

import type { CodeExecutePayload } from '@aiflow/queue';

import type { CodeHandlerDeps } from './deps';
import type { TaskRow } from './status';

type LiveCtx = {
  payload: CodeExecutePayload;
  task: TaskRow;
  branch: string;
  workDir: string;
  deps: CodeHandlerDeps;
};

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

/** Clone, branch, sandbox, push on success; FAILED on gate/runtime failure. */
export async function runLive(ctx: LiveCtx): Promise<void> {
  const { payload, branch, workDir, deps } = ctx;
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Клонирование репозитория…\n');
  await deps.cloneRepo({
    owner: payload.giteaOwner,
    repo: payload.giteaRepo,
    branch: payload.giteaDefaultBranch,
    workDir,
  });
  const seeded = await deps.ensureUserTemplate(workDir, payload.giteaRepo);
  if (seeded) {
    await deps.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      'Шаблон user-nextjs записан в репозиторий\n',
    );
  }
  await deps.checkoutTaskBranch(workDir, branch);
  await deps.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    `Ветка ${branch}; запуск sandbox…\n`,
  );
  await executeSandbox(ctx);
}

async function executeSandbox(ctx: LiveCtx): Promise<void> {
  const { payload, task, workDir, deps } = ctx;
  const apiKey = deps.resolveApiKey();
  const secret = await deps.writeApiKeySecret(apiKey);
  try {
    const out = await deps.runSandboxContainer({
      workspaceHostPath: workDir,
      apiKeyHostPath: secret.filePath,
      task: {
        title: task.title,
        description: task.description,
        acceptance: task.acceptance,
      },
      schemaName: payload.schemaName,
      taskId: payload.taskId,
    });
    await finishFromSandbox(ctx, out);
  } finally {
    await deps.removeSecretDir(secret.dir);
  }
}

async function finishFromSandbox(
  ctx: LiveCtx,
  out: Awaited<ReturnType<CodeHandlerDeps['runSandboxContainer']>>,
): Promise<void> {
  const { payload, branch, workDir, deps } = ctx;
  const ok = out.result?.status === 'success' && out.exitCode === 0;
  if (!ok) {
    const report = out.result?.report ?? `exit ${String(out.exitCode)}`;
    await failTask(payload, `Sandbox: ${report}\n`, deps);
    return;
  }
  // Checkpoint headCommit before push so a crash mid-push can resume (A1).
  const headCommit = await deps.readHeadCommit(workDir);
  await deps.recordTaskGit({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    branchName: branch,
    headCommit,
  });
  const diff = await deps.captureBranchDiff(workDir, payload.giteaDefaultBranch);
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Пуш ветки в Gitea…\n');
  await deps.pushBranch(workDir, branch);
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
    'Sandbox зелёный; отправлено на LLM-ревью…\n',
  );
}

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
