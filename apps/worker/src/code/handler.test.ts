import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { CodeExecutePayload } from '@aiflow/queue';

vi.mock('@aiflow/db', () => ({
  ensureTaskGitColumns: vi.fn(() => Promise.resolve()),
  retrieveLessons: vi.fn(() => Promise.resolve([])),
}));

import { handleCodeExecute, type CodeHandlerDeps } from './handler';
import { resolveBranchName, slugifyTitle } from './branch';
import { ATTEMPT_MARKER, stepDoneMarker } from './pipeline-steps';
import { parseResultFromLogs } from './result';

const PAYLOAD: CodeExecutePayload = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  taskId: 'task-12345678-abcd',
  giteaOwner: 'aistudio',
  giteaRepo: 'demo',
  giteaDefaultBranch: 'main',
  dryRun: true,
};

const TASK = {
  id: PAYLOAD.taskId,
  title: 'Add Recipe model',
  description: 'Create Recipe in schema.prisma',
  acceptance: 'Migration applied',
  status: 'PENDING' as const,
  branchName: null,
  headCommit: null,
};

function job(data: CodeExecutePayload): Job<CodeExecutePayload> {
  return { data, id: data.taskId } as Job<CodeExecutePayload>;
}

function mockDeps(overrides: Partial<CodeHandlerDeps> = {}): CodeHandlerDeps {
  return {
    loadTask: vi.fn(() => Promise.resolve(TASK)),
    claimInProgress: vi.fn(() => Promise.resolve(true)),
    setTaskStatus: vi.fn(() => Promise.resolve()),
    appendTaskLog: vi.fn(() => Promise.resolve()),
    listTaskLogMessages: vi.fn(() => Promise.resolve([])),
    cloneRepo: vi.fn(() => Promise.resolve()),
    ensureUserTemplate: vi.fn(() => Promise.resolve(false)),
    checkoutTaskBranch: vi.fn(() => Promise.resolve()),
    pushBranch: vi.fn(() => Promise.resolve()),
    pushCheckpointRef: vi.fn(() => Promise.resolve()),
    restoreCheckpointCommit: vi.fn(() => Promise.resolve()),
    readHeadCommit: vi.fn(() => Promise.resolve('abc123')),
    recordTaskGit: vi.fn(() => Promise.resolve()),
    captureBranchDiff: vi.fn(() => Promise.resolve('diff --git a/x\n')),
    enqueueCodeReview: vi.fn(() => Promise.resolve()),
    recordAudit: vi.fn(() => Promise.resolve({})),
    retrieveLessons: vi.fn(() => Promise.resolve([])),
    removeWorkDir: vi.fn(() => Promise.resolve()),
    resolveApiKey: vi.fn(() => 'sk-test'),
    writeApiKeySecret: vi.fn(() =>
      Promise.resolve({ dir: '/tmp/sec', filePath: '/tmp/sec/api_key' }),
    ),
    removeSecretDir: vi.fn(() => Promise.resolve()),
    runSandboxContainer: vi.fn(() =>
      Promise.resolve({
        exitCode: 0,
        result: { status: 'success' as const, report: 'OK' },
        logs: '',
      }),
    ),
    now: () => new Date('2026-08-07T02:00:00.000Z'),
    ...overrides,
  };
}

describe('slugifyTitle / resolveBranchName', () => {
  it('builds task/{short}-{slug}', () => {
    expect(slugifyTitle('Add Recipe model')).toBe('add-recipe-model');
    expect(resolveBranchName(PAYLOAD.taskId, 'Add Recipe model')).toBe(
      'task/task-123-add-recipe-model',
    );
  });

  it('honours branch override', () => {
    expect(resolveBranchName(PAYLOAD.taskId, 'x', 'custom/branch')).toBe('custom/branch');
  });
});

describe('parseResultFromLogs', () => {
  it('parses RESULT JSON after marker', () => {
    const logs = 'noise\n=== RESULT ===\n{"status":"success","report":"OK"}\n';
    expect(parseResultFromLogs(logs)).toEqual({ status: 'success', report: 'OK' });
  });
});

describe('handleCodeExecute dry-run and live', () => {
  it('does not start sandbox; sets AWAITING_REVIEW', async () => {
    const deps = mockDeps();
    await handleCodeExecute(job(PAYLOAD), deps);

    expect(deps.runSandboxContainer).not.toHaveBeenCalled();
    expect(deps.cloneRepo).not.toHaveBeenCalled();
    expect(deps.claimInProgress).toHaveBeenCalled();
    expect(deps.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'AWAITING_REVIEW' }),
    );
    expect(deps.appendTaskLog).toHaveBeenCalledWith(
      PAYLOAD.schemaName,
      PAYLOAD.taskId,
      expect.stringContaining('dry-run'),
    );
    expect(deps.removeWorkDir).toHaveBeenCalled();
  });

  it('live path clones, sandbox, checkpoint ref, push+review', async () => {
    const deps = mockDeps();
    await handleCodeExecute(job({ ...PAYLOAD, dryRun: false }), deps);

    expect(deps.cloneRepo).toHaveBeenCalled();
    expect(deps.runSandboxContainer).toHaveBeenCalled();
    expect(deps.pushCheckpointRef).toHaveBeenCalled();
    expect(deps.recordTaskGit).toHaveBeenCalledWith(
      expect.objectContaining({
        branchName: expect.stringContaining('task/'),
        headCommit: 'abc123',
      }),
    );
    expect(deps.pushBranch).toHaveBeenCalled();
    expect(deps.enqueueCodeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: PAYLOAD.taskId,
        projectId: PAYLOAD.projectId,
        diff: expect.any(String),
      }),
    );
    expect(deps.setTaskStatus).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DONE' }),
    );
  });
});

describe('handleCodeExecute A2 skip-done', () => {
  it('skips work when task already DONE', async () => {
    const deps = mockDeps({
      loadTask: vi.fn(() => Promise.resolve({ ...TASK, status: 'DONE' as const })),
    });
    await handleCodeExecute(job(PAYLOAD), deps);
    expect(deps.claimInProgress).not.toHaveBeenCalled();
    expect(deps.runSandboxContainer).not.toHaveBeenCalled();
    expect(deps.appendTaskLog).toHaveBeenCalledWith(
      PAYLOAD.schemaName,
      PAYLOAD.taskId,
      expect.stringContaining('DONE'),
    );
  });
});

describe('handleCodeExecute A2 crash-on-PUSH doc-test', () => {
  /**
   * Roadmap A2: crashed on PUSH → restart → commit lands once.
   * headCommit + checkpoint ref durable; sandbox must not re-run; push once.
   */
  it('restores checkpoint, pushes once, skips sandbox', async () => {
    const deps = mockDeps({
      loadTask: vi.fn(() =>
        Promise.resolve({
          ...TASK,
          status: 'IN_PROGRESS' as const,
          headCommit: 'abc123',
          branchName: 'task/task-123-add-recipe-model',
        }),
      ),
      listTaskLogMessages: vi.fn(() =>
        Promise.resolve([`${ATTEMPT_MARKER}\n`, `${stepDoneMarker('PARSE')}\n`]),
      ),
    });
    await handleCodeExecute(job({ ...PAYLOAD, dryRun: false }), deps);

    expect(deps.runSandboxContainer).not.toHaveBeenCalled();
    expect(deps.pushCheckpointRef).not.toHaveBeenCalled();
    expect(deps.restoreCheckpointCommit).toHaveBeenCalledWith(
      expect.any(String),
      PAYLOAD.taskId,
      'abc123',
    );
    expect(deps.pushBranch).toHaveBeenCalledTimes(1);
    expect(deps.enqueueCodeReview).toHaveBeenCalledTimes(1);
    expect(deps.appendTaskLog).toHaveBeenCalledWith(
      PAYLOAD.schemaName,
      PAYLOAD.taskId,
      expect.stringContaining('Возобновление'),
    );
  });
});
