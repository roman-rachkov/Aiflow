/**
 * Persist Reviewer verdict: TaskLog JSON + status transition (MVP-2 one-shot).
 * ACCEPTED → DONE; REJECTED → PENDING (manual re-run; Self-Refine is MVP-3 C1).
 */

import type { ReviewVerdict } from '@aiflow/ai-roles';

export const REVIEW_LOG_MARKER = '=== REVIEW ===';

export type ApplyVerdictDeps = {
  appendTaskLog: (
    schemaName: string,
    taskId: string,
    message: string,
    level?: 'INFO' | 'WARN' | 'ERROR',
  ) => Promise<void>;
  setTaskStatus: (input: {
    schemaName: string;
    taskId: string;
    status: 'DONE' | 'PENDING' | 'FAILED';
    completedAt?: Date | null;
  }) => Promise<void>;
  now: () => Date;
};

/** Format verdict for TaskLog (UI parses via REVIEW_LOG_MARKER). */
export function formatReviewLog(verdict: ReviewVerdict): string {
  return `${REVIEW_LOG_MARKER}\n${JSON.stringify(verdict)}\n`;
}

/** Write log + transition status from a validated verdict. */
export async function applyReviewVerdict(
  schemaName: string,
  taskId: string,
  verdict: ReviewVerdict,
  deps: ApplyVerdictDeps,
): Promise<void> {
  const accepted = verdict.verdict === 'ACCEPTED';
  await deps.appendTaskLog(
    schemaName,
    taskId,
    formatReviewLog(verdict),
    accepted ? 'INFO' : 'WARN',
  );
  if (accepted) {
    await deps.setTaskStatus({
      schemaName,
      taskId,
      status: 'DONE',
      completedAt: deps.now(),
    });
    await deps.appendTaskLog(schemaName, taskId, 'Ревью: ACCEPTED — задача выполнена\n');
    return;
  }
  await deps.setTaskStatus({
    schemaName,
    taskId,
    status: 'PENDING',
    completedAt: null,
  });
  await deps.appendTaskLog(
    schemaName,
    taskId,
    'Ревью: REJECTED — задача возвращена в очередь (запустите снова)\n',
    'WARN',
  );
}
