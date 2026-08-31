/**
 * BullMQ handler for `code-review` — LLM Reviewer with Self-Refine loop (MVP-3 C1).
 * ACCEPTED fast-forwards the task branch into main, then enqueues ready tasks.
 * REJECTED → re-enqueue code-execute with feedback (≤MAX_REVIEW_RETRIES); then FAILED.
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
import {
  getCodeQueue,
  validateReviewPayload,
  type CodeExecutePayload,
  type CodeReviewPayload,
} from '@aiflow/queue';

import { auditReviewerVerdict, defaultRecordAudit, type RecordAuditFn } from '../audit';
import { enqueueReadyTasks, loadReadyCtx } from '../code/enqueue-ready';
import { mergeTaskBranch } from '../code/merge';
import { appendTaskLog, loadTask, recordTaskGit, setTaskStatus } from '../code/status';
import type { ApplyVerdictDeps } from './apply-verdict';
import { finishAcceptedReview, type FinishAcceptedDeps } from './finish-accepted';
import { handleRejectedVerdict } from './retry';

export type ReviewHandlerDeps = {
  loadTask: typeof loadTask;
  generateVerdict: (input: ReviewTaskInput) => Promise<ReviewVerdict>;
  applyVerdict: ApplyVerdictDeps;
  finishAccepted: FinishAcceptedDeps;
  enqueueCodeExecute: (payload: CodeExecutePayload) => Promise<void>;
  recordAudit: RecordAuditFn;
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
  enqueueCodeExecute: async (payload) => {
    await getCodeQueue().add('code:execute', payload);
  },
  recordAudit: defaultRecordAudit,
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
  await auditReviewerVerdict(deps.recordAudit, {
    projectId: payload.projectId,
    taskId: payload.taskId,
    verdict: verdict.verdict,
    confidence: verdict.confidence,
  });
  if (verdict.verdict === 'ACCEPTED') {
    await settleAccepted(payload, verdict, deps);
    return;
  }
  await handleRejectedVerdict(payload, verdict, {
    applyVerdict: deps.applyVerdict,
    loadGitea: deps.finishAccepted.loadGitea,
    enqueueCodeExecute: deps.enqueueCodeExecute,
  });
}

async function settleAccepted(
  payload: CodeReviewPayload,
  verdict: ReviewVerdict,
  deps: ReviewHandlerDeps,
): Promise<void> {
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
