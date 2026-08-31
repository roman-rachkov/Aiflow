import { Queue, type DefaultJobOptions } from 'bullmq';

import { createRedisConnection } from './connection';
import { QUEUE_CODE_REVIEW } from './names';

/**
 * Payload for `code-review` (MVP-2 Task 4.1 one-shot LLM Reviewer).
 * Diff is captured after sandbox success, before the workdir is removed.
 * `retryCount` tracks how many Self-Refine iterations have already run (MVP-3 C1).
 */
export type CodeReviewPayload = {
  projectId: string;
  schemaName: string;
  taskId: string;
  branchName: string;
  /** Unified diff against the default branch (may be truncated). */
  diff: string;
  checks?: {
    typescript?: boolean | null;
    eslint?: boolean | null;
    tests?: boolean | null;
  };
  /** Self-Refine iteration index: 0 = first review, 1+ = after retry (MVP-3 C1). */
  retryCount?: number;
};

/** Review jobs: a few attempts for transient LLM blips; parse retries in handler. */
export const REVIEW_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 2,
  removeOnComplete: 50,
  removeOnFail: 50,
};

/** Validate payload shape; throws on missing/empty required fields. */
export function validateReviewPayload(data: CodeReviewPayload): void {
  for (const key of ['projectId', 'schemaName', 'taskId', 'branchName'] as const) {
    const value = data[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Invalid review payload: missing ${key}`);
    }
  }
  if (typeof data.diff !== 'string') {
    throw new Error('Invalid review payload: missing diff');
  }
}

let reviewQueue: Queue<CodeReviewPayload> | undefined;

/** Producer-only queue accessor. */
export function getReviewQueue(): Queue<CodeReviewPayload> {
  reviewQueue ??= new Queue<CodeReviewPayload>(QUEUE_CODE_REVIEW, {
    connection: createRedisConnection(),
    defaultJobOptions: REVIEW_JOB_OPTIONS,
  });
  return reviewQueue;
}

/** Test / shutdown helper — clears the singleton. */
export async function closeReviewQueue(): Promise<void> {
  if (!reviewQueue) return;
  await reviewQueue.close();
  reviewQueue = undefined;
}
