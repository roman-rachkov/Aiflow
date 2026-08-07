import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { CodeExecutePayload } from '@aiflow/queue';

import { handleCodeExecute, type CodeHandlerDeps } from './handler';
import { resolveBranchName, slugifyTitle } from './branch';
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
};

function job(data: CodeExecutePayload): Job<CodeExecutePayload> {
  return { data, id: data.taskId } as Job<CodeExecutePayload>;
}

function mockDeps(overrides: Partial<CodeHandlerDeps> = {}): CodeHandlerDeps {
  return {
    loadTask: vi.fn(() => Promise.resolve(TASK)),
    setTaskStatus: vi.fn(() => Promise.resolve()),
    appendTaskLog: vi.fn(() => Promise.resolve()),
    cloneRepo: vi.fn(() => Promise.resolve()),
    checkoutTaskBranch: vi.fn(() => Promise.resolve()),
    pushBranch: vi.fn(() => Promise.resolve()),
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

describe('handleCodeExecute dry-run', () => {
  it('does not start sandbox; sets AWAITING_REVIEW', async () => {
    const deps = mockDeps();
    await handleCodeExecute(job(PAYLOAD), deps);

    expect(deps.runSandboxContainer).not.toHaveBeenCalled();
    expect(deps.cloneRepo).not.toHaveBeenCalled();
    expect(deps.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'IN_PROGRESS' }),
    );
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

  it('live path clones and runs sandbox', async () => {
    const deps = mockDeps();
    await handleCodeExecute(job({ ...PAYLOAD, dryRun: false }), deps);

    expect(deps.cloneRepo).toHaveBeenCalled();
    expect(deps.runSandboxContainer).toHaveBeenCalled();
    expect(deps.pushBranch).toHaveBeenCalled();
    expect(deps.setTaskStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'DONE' }));
  });
});
