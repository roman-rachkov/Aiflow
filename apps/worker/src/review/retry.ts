/**
 * Reviewer Self-Refine retry helpers (MVP-3 C1).
 * After REJECTED: re-enqueue code-execute with feedback up to MAX_RETRIES.
 * Exceeding the cap → FAILED + manual intervention required.
 */

import type { ReviewVerdict } from '@aiflow/ai-roles';
import type { CodeExecutePayload, CodeReviewPayload } from '@aiflow/queue';

import { applyReviewVerdict, type ApplyVerdictDeps } from './apply-verdict';

export const MAX_REVIEW_RETRIES = 3;

/**
 * Build a human-readable feedback string from a REJECTED verdict.
 * Passed back to the sandbox as `reviewFeedback` on the next attempt.
 */
export function buildReviewFeedback(verdict: ReviewVerdict): string {
  const { summary, details } = verdict;
  const lines: string[] = [`REVIEWER FEEDBACK: ${summary}`];
  if (details.issues.length > 0) {
    lines.push('Issues:');
    for (const issue of details.issues) {
      lines.push(
        `  - [${issue.severity}] ${issue.file}:${String(issue.line)} ${issue.description}`,
      );
    }
  }
  if (details.suggestions) {
    lines.push(`Suggestions: ${details.suggestions}`);
  }
  return lines.join('\n');
}

/**
 * Decide whether the Self-Refine loop should retry or give up.
 * Returns the retry count that would be used on the next attempt, or null if capped.
 */
export function nextRetryCount(currentCount: number | undefined): number | null {
  const used = currentCount ?? 0;
  if (used >= MAX_REVIEW_RETRIES) return null;
  return used + 1;
}

export type GiteaInfo = {
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/**
 * Build the re-enqueue payload for code-execute from a REJECTED review.
 * Caller must check `nextRetryCount` first and provide Gitea coordinates.
 */
export function buildRetryPayload(
  reviewPayload: CodeReviewPayload,
  gitea: GiteaInfo,
  verdict: ReviewVerdict,
  retryCount: number,
): CodeExecutePayload {
  return {
    projectId: reviewPayload.projectId,
    schemaName: reviewPayload.schemaName,
    taskId: reviewPayload.taskId,
    giteaOwner: gitea.giteaOwner,
    giteaRepo: gitea.giteaRepo,
    giteaDefaultBranch: gitea.giteaDefaultBranch,
    dryRun: false,
    branchName: reviewPayload.branchName,
    retryCount,
    reviewFeedback: buildReviewFeedback(verdict),
  };
}

export type RejectedVerdictDeps = {
  applyVerdict: ApplyVerdictDeps;
  loadGitea: (projectId: string) => Promise<GiteaInfo | null>;
  enqueueCodeExecute: (payload: CodeExecutePayload) => Promise<void>;
};

/**
 * Handle a REJECTED verdict: retry or fail.
 * Encapsulates the Self-Refine cap check, Gitea lookup, and re-enqueue.
 */
export async function handleRejectedVerdict(
  payload: CodeReviewPayload,
  verdict: ReviewVerdict,
  deps: RejectedVerdictDeps,
): Promise<void> {
  const retry = nextRetryCount(payload.retryCount);
  if (retry === null) {
    await deps.applyVerdict.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      `Ревью: REJECTED после ${String(MAX_REVIEW_RETRIES)} попыток — задача в FAILED\n`,
      'ERROR',
    );
    await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
    await deps.applyVerdict.setTaskStatus({
      schemaName: payload.schemaName,
      taskId: payload.taskId,
      status: 'FAILED',
      completedAt: deps.applyVerdict.now(),
    });
    return;
  }
  const gitea = await deps.loadGitea(payload.projectId);
  if (!gitea) {
    await deps.applyVerdict.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      'Self-Refine: не найдены Gitea-координаты — переход в FAILED\n',
      'ERROR',
    );
    await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
    await deps.applyVerdict.setTaskStatus({
      schemaName: payload.schemaName,
      taskId: payload.taskId,
      status: 'FAILED',
      completedAt: deps.applyVerdict.now(),
    });
    return;
  }
  await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
  await deps.enqueueCodeExecute(buildRetryPayload(payload, gitea, verdict, retry));
  await deps.applyVerdict.appendTaskLog(
    payload.schemaName,
    payload.taskId,
    `Ревью: REJECTED (попытка ${String(retry)}/${String(MAX_REVIEW_RETRIES)}) — доработка\n`,
    'WARN',
  );
}
