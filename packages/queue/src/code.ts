import { Queue, type DefaultJobOptions } from 'bullmq';

import { createRedisConnection } from './connection';
import { QUEUE_CODE_EXECUTE } from './names';

/**
 * Payload for `code:execute`. `taskId` is the project-schema Task row.
 * `dryRun: true` plans without starting the Aider sandbox.
 */
export type CodeExecutePayload = {
  projectId: string;
  schemaName: string;
  taskId: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
  dryRun: boolean;
  branchName?: string;
};

/**
 * Code jobs are fail-fast: sandbox / git errors should not silent-retry.
 * Operator re-enqueues via UI after FAILED.
 */
export const CODE_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 1,
  removeOnComplete: 50,
  removeOnFail: 50,
};

const REQUIRED: (keyof CodeExecutePayload)[] = [
  'projectId',
  'schemaName',
  'taskId',
  'giteaOwner',
  'giteaRepo',
  'giteaDefaultBranch',
];

/** Validate payload shape; throws on missing/empty strings or bad dryRun. */
export function validateCodePayload(data: CodeExecutePayload): void {
  for (const key of REQUIRED) {
    const value = data[key];
    if (!value || typeof value !== 'string') {
      throw new Error(`Invalid code payload: missing ${key}`);
    }
  }
  if (typeof data.dryRun !== 'boolean') {
    throw new Error('Invalid code payload: dryRun must be boolean');
  }
  if (data.branchName !== undefined && typeof data.branchName !== 'string') {
    throw new Error('Invalid code payload: branchName must be string');
  }
}

/** Redis pub/sub channel for live sandbox logs (WS fan-out). */
export function sandboxLogsChannel(taskId: string): string {
  return `sandbox:logs:${taskId}`;
}

let codeQueue: Queue<CodeExecutePayload> | undefined;

/** Producer-only queue accessor. App never runs workers from this package. */
export function getCodeQueue(): Queue<CodeExecutePayload> {
  codeQueue ??= new Queue<CodeExecutePayload>(QUEUE_CODE_EXECUTE, {
    connection: createRedisConnection(),
    defaultJobOptions: CODE_JOB_OPTIONS,
  });
  return codeQueue;
}

/** Test / shutdown helper — clears the singleton. */
export async function closeCodeQueue(): Promise<void> {
  if (!codeQueue) return;
  await codeQueue.close();
  codeQueue = undefined;
}
