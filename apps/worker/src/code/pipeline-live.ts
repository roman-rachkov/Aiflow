/**
 * Step-encoded live path for code:execute (MVP-3 A2).
 * CLONE→CHECKOUT→SANDBOX→PARSE→PUSH→DONE with TaskLog checkpoints.
 */

import type { LivePipelineCtx } from './deps';
import { isBeforeStep, stepDoneMarker, type PipelineStep } from './pipeline-steps';
import { failTask } from './pipeline-fail';
import { auditCoderPush } from '../audit';
import { assertCapability, runWithRoleAsync } from '@aiflow/ai-roles';

/** Clone → … → enqueue review; durable steps skip when already finished. */
export async function runLiveSteps(ctx: LivePipelineCtx): Promise<void> {
  await prepareWorkspace(ctx);
  if (!isBeforeStep('SANDBOX', ctx.resumeFrom)) {
    const ok = await runSandboxStep(ctx);
    if (!ok) return;
    await markStep(ctx, 'SANDBOX');
  }
  if (!isBeforeStep('PARSE', ctx.resumeFrom)) {
    await runParseStep(ctx);
    await markStep(ctx, 'PARSE');
  }
  if (!isBeforeStep('PUSH', ctx.resumeFrom)) {
    await runPushStep(ctx);
    await markStep(ctx, 'PUSH');
  }
  if (!isBeforeStep('DONE', ctx.resumeFrom)) {
    await runDoneStep(ctx);
    await markStep(ctx, 'DONE');
  }
}

async function markStep(ctx: LivePipelineCtx, step: PipelineStep): Promise<void> {
  await ctx.deps.appendTaskLog(
    ctx.payload.schemaName,
    ctx.payload.taskId,
    `${stepDoneMarker(step)}\n`,
  );
}

/** Always clone; past PARSE restore checkpoint SHA into the task branch. */
async function prepareWorkspace(ctx: LivePipelineCtx): Promise<void> {
  const { payload, branch, workDir, deps, resumeFrom, task } = ctx;
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Клонирование репозитория…\n');
  await deps.cloneRepo({
    owner: payload.giteaOwner,
    repo: payload.giteaRepo,
    branch: payload.giteaDefaultBranch,
    workDir,
  });
  if (!isBeforeStep('CLONE', resumeFrom)) await markStep(ctx, 'CLONE');

  // Past PARSE: headCommit + checkpoint ref are durable — restore them.
  if ((resumeFrom === 'PUSH' || resumeFrom === 'DONE') && task.headCommit) {
    await deps.restoreCheckpointCommit(workDir, payload.taskId, task.headCommit);
    await deps.checkoutTaskBranch(workDir, branch);
  } else {
    const seeded = await deps.ensureUserTemplate(workDir, payload.giteaRepo);
    if (seeded) {
      await deps.appendTaskLog(
        payload.schemaName,
        payload.taskId,
        'Шаблон user-nextjs записан в репозиторий\n',
      );
    }
    await deps.checkoutTaskBranch(workDir, branch);
  }
  if (!isBeforeStep('CHECKOUT', resumeFrom)) await markStep(ctx, 'CHECKOUT');
  await deps.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    `Ветка ${branch}; resumeFrom=${resumeFrom}\n`,
  );
}

async function runSandboxStep(ctx: LivePipelineCtx): Promise<boolean> {
  const { payload, task, workDir, deps } = ctx;
  await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Запуск sandbox…\n');
  const apiKey = deps.resolveApiKey();
  const secret = await deps.writeApiKeySecret(apiKey);
  const description = await buildSandboxDescription(payload, task, deps);
  try {
    const out = await deps.runSandboxContainer({
      workspaceHostPath: workDir,
      apiKeyHostPath: secret.filePath,
      task: {
        title: task.title,
        description,
        acceptance: task.acceptance,
      },
      schemaName: payload.schemaName,
      taskId: payload.taskId,
    });
    const ok = out.result?.status === 'success' && out.exitCode === 0;
    if (!ok) {
      const report = out.result?.report ?? `exit ${String(out.exitCode)}`;
      await failTask(payload, `Sandbox: ${report}\n`, deps);
      return false;
    }
    return true;
  } finally {
    await deps.removeSecretDir(secret.dir);
  }
}

async function buildSandboxDescription(
  payload: { schemaName: string; taskId: string; reviewFeedback?: string },
  task: { description: string },
  deps: Pick<LivePipelineCtx['deps'], 'retrieveLessons'>,
): Promise<string> {
  const parts: string[] = [task.description];
  const lessons = await deps.retrieveLessons(payload.schemaName, payload.taskId);
  if (lessons.length > 0) {
    parts.push(
      'Past lessons — do not repeat these mistakes:\n' +
        lessons.map((l, i) => `  ${String(i + 1)}. ${l}`).join('\n'),
    );
  }
  if (payload.reviewFeedback) {
    parts.push(payload.reviewFeedback);
  }
  return parts.join('\n\n');
}

async function runParseStep(ctx: LivePipelineCtx): Promise<void> {
  const { payload, branch, workDir, deps } = ctx;
  const headCommit = await deps.readHeadCommit(workDir);
  await deps.pushCheckpointRef(workDir, payload.taskId);
  await deps.recordTaskGit({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    branchName: branch,
    headCommit,
  });
  ctx.task.headCommit = headCommit;
  ctx.task.branchName = branch;
}

async function runPushStep(ctx: LivePipelineCtx): Promise<void> {
  const { payload, branch, workDir, deps, task } = ctx;
  await runWithRoleAsync('coder', async () => {
    assertCapability('write-commit');
    await deps.appendTaskLog(payload.schemaName, payload.taskId, 'Пуш ветки в Gitea…\n');
    await deps.pushBranch(workDir, branch);
  });
  const headCommit = task.headCommit ?? (await deps.readHeadCommit(workDir));
  await auditCoderPush(deps.recordAudit, {
    projectId: payload.projectId,
    taskId: payload.taskId,
    headCommit,
    branchName: branch,
  });
}

async function runDoneStep(ctx: LivePipelineCtx): Promise<void> {
  const { payload, branch, workDir, deps } = ctx;
  const diff = await deps.captureBranchDiff(workDir, payload.giteaDefaultBranch);
  await deps.enqueueCodeReview({
    projectId: payload.projectId,
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    branchName: branch,
    diff,
    checks: { typescript: true, eslint: true, tests: null },
    retryCount: payload.retryCount,
  });
  await deps.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    'Sandbox зелёный; отправлено на LLM-ревью…\n',
  );
}
