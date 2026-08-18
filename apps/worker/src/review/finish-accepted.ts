/**
 * After ACCEPTED: FF task branch into main, mark git fields, enqueue next tasks.
 */

import type { ReviewVerdict } from '@aiflow/ai-roles';
import type { CodeReviewPayload } from '@aiflow/queue';

import type { MergeTaskBranchInput } from '../code/merge';
import type { RecordTaskGitInput } from '../code/status';
import type { ApplyVerdictDeps } from './apply-verdict';
import { applyReviewVerdict } from './apply-verdict';

export type FinishAcceptedDeps = {
  mergeTaskBranch: (input: MergeTaskBranchInput) => Promise<string>;
  recordTaskGit: (input: RecordTaskGitInput) => Promise<void>;
  enqueueReadyTasks: (projectId: string, schemaName: string) => Promise<string[]>;
  loadGitea: (projectId: string) => Promise<{
    giteaOwner: string;
    giteaRepo: string;
    giteaDefaultBranch: string;
  } | null>;
  applyVerdict: ApplyVerdictDeps;
};

/** Merge + DONE + chain the next unblocked PENDING tasks. */
export async function finishAcceptedReview(
  payload: CodeReviewPayload,
  verdict: ReviewVerdict,
  deps: FinishAcceptedDeps,
): Promise<void> {
  const gitea = await deps.loadGitea(payload.projectId);
  if (!gitea) throw new Error(`Gitea identity missing for ${payload.projectId}`);
  const sha = await deps.mergeTaskBranch({
    owner: gitea.giteaOwner,
    repo: gitea.giteaRepo,
    defaultBranch: gitea.giteaDefaultBranch,
    taskBranch: payload.branchName,
    taskId: payload.taskId,
  });
  await deps.recordTaskGit({
    schemaName: payload.schemaName,
    taskId: payload.taskId,
    headCommit: sha,
    mergedAt: deps.applyVerdict.now(),
  });
  await applyReviewVerdict(payload.schemaName, payload.taskId, verdict, deps.applyVerdict);
  const next = await deps.enqueueReadyTasks(payload.projectId, payload.schemaName);
  if (next.length > 0) {
    await deps.applyVerdict.appendTaskLog(
      payload.schemaName,
      payload.taskId,
      `Следующие задачи в очереди: ${next.join(', ')}\n`,
    );
  }
}
