/**
 * BullMQ handler for `code-review` — one-shot LLM Reviewer (MVP-2 Task 4.1).
 */

import type { Job } from 'bullmq';
import {
  createProviderFromEnv,
  generateReviewVerdict,
  type ReviewTaskInput,
  type ReviewVerdict,
} from '@aiflow/ai-roles';
import { validateReviewPayload, type CodeReviewPayload } from '@aiflow/queue';

import { appendTaskLog, loadTask, setTaskStatus } from '../code/status';
import { applyReviewVerdict, type ApplyVerdictDeps } from './apply-verdict';

export type ReviewHandlerDeps = {
  loadTask: typeof loadTask;
  generateVerdict: (input: ReviewTaskInput) => Promise<ReviewVerdict>;
  applyVerdict: ApplyVerdictDeps;
};

const defaultDeps: ReviewHandlerDeps = {
  loadTask,
  generateVerdict: (input) => generateReviewVerdict(createProviderFromEnv(), input),
  applyVerdict: {
    appendTaskLog,
    setTaskStatus,
    now: () => new Date(),
  },
};

/** Process one code-review job. Exported for unit tests with mocked deps. */
export async function handleCodeReview(
  job: Job<CodeReviewPayload>,
  deps: ReviewHandlerDeps = defaultDeps,
): Promise<ReviewVerdict> {
  const payload = job.data;
  validateReviewPayload(payload);

  const task = await deps.loadTask(payload.schemaName, payload.taskId);
  if (!task) throw new Error(`Task not found: ${payload.taskId}`);

  await deps.applyVerdict.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    'LLM-ревью запущено…\n',
  );

  const verdict = await deps.generateVerdict({
    title: task.title,
    description: task.description,
    acceptance: task.acceptance,
    diff: payload.diff,
    checks: payload.checks,
  });

  await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
  return verdict;
}
