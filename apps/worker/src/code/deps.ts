/**
 * Injectable deps for code:execute handler (unit-test seam).
 */

import type { CodeReviewPayload } from '@aiflow/queue';

import type { TaskRowWithGit } from './claim';
import type { CodeTaskStatus } from './status';

export type CodeHandlerDeps = {
  loadTask: (schemaName: string, taskId: string) => Promise<TaskRowWithGit | null>;
  claimInProgress: (input: {
    schemaName: string;
    taskId: string;
    startedAt: Date;
  }) => Promise<boolean>;
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
  ensureUserTemplate: (workDir: string, projectName: string) => Promise<boolean>;
  checkoutTaskBranch: (workDir: string, branchName: string) => Promise<void>;
  pushBranch: (workDir: string, branchName: string) => Promise<void>;
  readHeadCommit: (workDir: string) => Promise<string>;
  recordTaskGit: (input: {
    schemaName: string;
    taskId: string;
    branchName?: string | null;
    headCommit?: string | null;
    mergedAt?: Date | null;
  }) => Promise<void>;
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
