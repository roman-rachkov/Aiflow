/**
 * BullMQ handler for `code-review` — one-shot LLM Reviewer (MVP-2 Task 4.1).
 * ACCEPTED fast-forwards the task branch into main, then enqueues ready tasks.
 */

import type { Job } from 'bullmq';
import {
  createProviderFromEnv,
  generateReviewVerdict,
  getCurrentTraceId,
  runWithTraceContext,
  type ReviewTaskInput,
  type ReviewVerdict,
} from '@aiflow/ai-roles';
import { ensureTaskGitColumns } from '@aiflow/db';
import { validateReviewPayload, type CodeReviewPayload } from '@aiflow/queue';

import { enqueueReadyTasks, loadReadyCtx } from '../code/enqueue-ready';
import { mergeTaskBranch } from '../code/merge';
import { appendTaskLog, loadTask, recordTaskGit, setTaskStatus } from '../code/status';
import { applyReviewVerdict, type ApplyVerdictDeps } from './apply-verdict';
import { finishAcceptedReview, type FinishAcceptedDeps } from './finish-accepted';

export type ReviewHandlerDeps = {
  loadTask: typeof loadTask;
  generateVerdict: (input: ReviewTaskInput) => Promise<ReviewVerdict>;
  applyVerdict: ApplyVerdictDeps;
  finishAccepted: FinishAcceptedDeps;
};

const defaultDeps: ReviewHandlerDeps = {
  loadTask,
  generateVerdict: (input) => generateReviewVerdict(createProviderFromEnv(), input),
  applyVerdict: {
    appendTaskLog,
    setTaskStatus,
    now: () => new Date(),
  },
  finishAccepted: {
    mergeTaskBranch,
    recordTaskGit,
    enqueueReadyTasks,
    loadGitea: async (projectId) => {
      const ctx = await loadReadyCtx(projectId);
      if (!ctx) return null;
      return {
        giteaOwner: ctx.giteaOwner,
        giteaRepo: ctx.giteaRepo,
        giteaDefaultBranch: ctx.giteaDefaultBranch,
      };
    },
    applyVerdict: {
      appendTaskLog,
      setTaskStatus,
      now: () => new Date(),
    },
  },
};

/** Process one code-review job. Exported for unit tests with mocked deps. */
export async function handleCodeReview(
  job: Job<CodeReviewPayload>,
  deps: ReviewHandlerDeps = defaultDeps,
): Promise<ReviewVerdict> {
  const payload = job.data;
  validateReviewPayload(payload);
  await ensureTaskGitColumns(payload.schemaName);

  const task = await deps.loadTask(payload.schemaName, payload.taskId);
  if (!task) throw new Error(`Task not found: ${payload.taskId}`);

  await deps.applyVerdict.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    'LLM-ревью запущено…\n',
  );

  let traceId: string | undefined;
  const verdict = await runWithTraceContext(
    {
      role: 'reviewer',
      projectId: payload.projectId,
      taskId: payload.taskId,
      tags: ['code-review'],
    },
    async () => {
      const result = await deps.generateVerdict({
        title: task.title,
        description: task.description,
        acceptance: task.acceptance,
        diff: payload.diff,
        checks: payload.checks,
      });
      traceId = getCurrentTraceId();
      return result;
    },
  );

  if (traceId) {
    await deps.applyVerdict.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      `langfuseTraceId=${traceId}\n`,
    );
  }

  await settleVerdict(payload, verdict, deps);
  return verdict;
}

async function settleVerdict(
  payload: CodeReviewPayload,
  verdict: ReviewVerdict,
  deps: ReviewHandlerDeps,
): Promise<void> {
  if (verdict.verdict !== 'ACCEPTED') {
    await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
    return;
  }
  try {
    await finishAcceptedReview(payload, verdict, {
      ...deps.finishAccepted,
      applyVerdict: deps.applyVerdict,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.applyVerdict.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      `Не удалось слить ветку в main: ${message}\n`,
      'ERROR',
    );
    await deps.applyVerdict.setTaskStatus({
      schemaName: payload.schemaName,
      taskId: payload.taskId,
      status: 'FAILED',
      completedAt: deps.applyVerdict.now(),
    });
  }
}
