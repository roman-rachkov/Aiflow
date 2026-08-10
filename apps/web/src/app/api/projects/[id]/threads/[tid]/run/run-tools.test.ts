/**
 * Unit tests for Stage E `executeTool` handlers. Feature services are mocked;
 * assertions cover Pro-gate, SPEC-required, and happy-path payloads.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolExecContext } from './run-tools';

const {
  listTasks,
  getTaskDetail,
  enqueuePlan,
  enqueueExecute,
  resolveCodeContext,
  PlanSpecRequiredError,
  createDeployment,
  resolveDeployContext,
  listTree,
  getFileContent,
  resolveEditorContext,
  generateSpecification,
} = vi.hoisted(() => {
  class PlanSpecRequiredError extends Error {
    constructor() {
      super('spec required');
      this.name = 'PlanSpecRequiredError';
    }
  }
  return {
    listTasks: vi.fn(),
    getTaskDetail: vi.fn(),
    enqueuePlan: vi.fn(),
    enqueueExecute: vi.fn(),
    resolveCodeContext: vi.fn(),
    PlanSpecRequiredError,
    createDeployment: vi.fn(),
    resolveDeployContext: vi.fn(),
    listTree: vi.fn(),
    getFileContent: vi.fn(),
    resolveEditorContext: vi.fn(),
    generateSpecification: vi.fn(),
  };
});

vi.mock('@/features/tasks', () => ({
  listTasks,
  getTaskDetail,
  enqueuePlan,
  enqueueExecute,
  resolveCodeContext,
  PlanSpecRequiredError,
}));
vi.mock('@/features/deploy', () => ({ createDeployment, resolveDeployContext }));
vi.mock('@/features/editor', () => ({
  listTree,
  getFileContent,
  resolveEditorContext,
  isBinaryFileError: () => false,
  isNotFoundError: () => false,
}));
vi.mock('@/features/specifications', () => ({ generateSpecification }));
vi.mock('@/features/chat', () => ({
  listMessages: vi.fn(),
  readSpecTemplate: vi.fn(),
}));
vi.mock('@/features/files/rag', () => ({ retrieveContext: vi.fn() }));

const { executeTool } = await import('./run-tools');

afterEach(() => {
  vi.clearAllMocks();
});

function baseCtx(uiMode: 'BASIC' | 'PRO' = 'PRO'): ToolExecContext {
  return {
    schemaName: 'project_x',
    projectId: 'p1',
    ownerId: 'u1',
    uiMode,
    resolved: {
      provider: {} as ToolExecContext['resolved']['provider'],
      chatConfig: { model: 'm', apiKey: 'k' },
      source: 'env',
    },
  };
}

describe('executeTool — list_tasks / task_status', () => {
  it('list_tasks returns tasks from the service', async () => {
    listTasks.mockResolvedValue([{ id: 't1', title: 'A', status: 'PENDING' }]);
    const result = await executeTool('list_tasks', {}, baseCtx('BASIC'));
    expect(result.error).toBeUndefined();
    expect(result.content).toEqual({
      tasks: [{ id: 't1', title: 'A', status: 'PENDING' }],
    });
  });

  it('task_status returns task + logs', async () => {
    getTaskDetail.mockResolvedValue({
      id: 't1',
      title: 'A',
      status: 'PENDING',
      logs: [{ id: 'l1', message: 'hi', level: 'info', createdAt: '2026-01-01' }],
    });
    const result = await executeTool('task_status', { taskId: 't1' }, baseCtx());
    expect(result.content).toMatchObject({
      task: { id: 't1', title: 'A' },
      logs: [{ id: 'l1' }],
    });
  });
});

describe('executeTool — Pro gate', () => {
  it('run_planner rejects BASIC users', async () => {
    const result = await executeTool('run_planner', {}, baseCtx('BASIC'));
    expect(result.error).toBe(true);
    expect(result.content).toEqual({ error: 'Требуется Pro' });
    expect(enqueuePlan).not.toHaveBeenCalled();
  });

  it('list_files / read_file reject BASIC', async () => {
    const list = await executeTool('list_files', {}, baseCtx('BASIC'));
    const read = await executeTool('read_file', { path: 'a.ts' }, baseCtx('BASIC'));
    expect(list.content).toEqual({ error: 'Требуется Pro' });
    expect(read.content).toEqual({ error: 'Требуется Pro' });
  });
});

describe('executeTool — run_planner', () => {
  it('returns queued jobId for PRO', async () => {
    enqueuePlan.mockResolvedValue({
      jobId: 'plan-1',
      specificationId: 's1',
      specificationVersion: 2,
    });
    const result = await executeTool('run_planner', {}, baseCtx('PRO'));
    expect(result.content).toMatchObject({ status: 'queued', jobId: 'plan-1' });
  });

  it('maps missing SPEC to a Russian error', async () => {
    enqueuePlan.mockRejectedValue(new PlanSpecRequiredError());
    const result = await executeTool('run_planner', {}, baseCtx('PRO'));
    expect(result.error).toBe(true);
    expect(result.content).toEqual({ error: 'Сначала утвердите спецификацию' });
  });
});

describe('executeTool — run_coder / deploy / files', () => {
  it('run_coder enqueues dry-run by title', async () => {
    listTasks.mockResolvedValue([{ id: 't9', title: 'Add login' }]);
    resolveCodeContext.mockResolvedValue({
      projectId: 'p1',
      schemaName: 'project_x',
      giteaOwner: 'o',
      giteaRepo: 'r',
      giteaDefaultBranch: 'main',
    });
    enqueueExecute.mockResolvedValue({ jobId: 'code-1', taskId: 't9', dryRun: true });
    const result = await executeTool('run_coder', { title: 'login' }, baseCtx('PRO'));
    expect(enqueueExecute).toHaveBeenCalledWith(expect.anything(), 't9', true);
    expect(result.content).toMatchObject({ status: 'queued', taskId: 't9', dryRun: true });
  });

  it('deploy returns BUILDING payload', async () => {
    resolveDeployContext.mockResolvedValue({ projectId: 'p1' });
    createDeployment.mockResolvedValue({ deploymentId: 'd1', status: 'BUILDING' });
    const result = await executeTool('deploy', {}, baseCtx('PRO'));
    expect(result.content).toEqual({ deploymentId: 'd1', status: 'BUILDING' });
  });

  it('list_files returns tree for PRO', async () => {
    resolveEditorContext.mockResolvedValue({ id: 'p1' });
    listTree.mockResolvedValue([{ path: 'a.ts', name: 'a.ts', type: 'file' }]);
    const result = await executeTool('list_files', {}, baseCtx('PRO'));
    expect(result.content).toEqual({
      tree: [{ path: 'a.ts', name: 'a.ts', type: 'file' }],
    });
  });
});
