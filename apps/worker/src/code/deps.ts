/**
 * Injectable deps for code:execute handler (unit-test seam).
 */

import type { CodeReviewPayload } from '@aiflow/queue';

import type { CodeTaskStatus, TaskRow } from './status';

export type CodeHandlerDeps = {
  loadTask: (schemaName: string, taskId: string) => Promise<TaskRow | null>;
  setTaskStatus: (input: {
    schemaName: string;
    taskId: string;
    status: CodeTaskStatus;
    startedAt?: Date | null;
    completedAt?: Date | null;
  }) => Promise<void>;
  appendTaskLog: (
    schemaName: string,
    taskId: string,
    message: string,
    level?: 'INFO' | 'WARN' | 'ERROR',
  ) => Promise<void>;
  cloneRepo: (args: {
    owner: string;
    repo: string;
    branch: string;
    workDir: string;
  }) => Promise<void>;
  checkoutTaskBranch: (workDir: string, branchName: string) => Promise<void>;
  pushBranch: (workDir: string, branchName: string) => Promise<void>;
  captureBranchDiff: (workDir: string, baseBranch: string) => Promise<string>;
  enqueueCodeReview: (payload: CodeReviewPayload) => Promise<void>;
  removeWorkDir: (workDir: string) => Promise<void>;
  resolveApiKey: (env?: NodeJS.ProcessEnv) => string;
  writeApiKeySecret: (
    apiKey: string,
    baseDir?: string,
  ) => Promise<{ dir: string; filePath: string }>;
  removeSecretDir: (dir: string) => Promise<void>;
  runSandboxContainer: (input: {
    workspaceHostPath: string;
    apiKeyHostPath: string;
    task: { title: string; description: string; acceptance: string };
    schemaName: string;
    taskId: string;
  }) => Promise<{
    exitCode: number;
    result: { status: 'success' | 'failure'; report?: string } | null;
    logs: string;
  }>;
  now: () => Date;
};
