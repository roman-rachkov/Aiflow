import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn();
const taskFindFirst = vi.fn();
const taskFindMany = vi.fn();
const depFindMany = vi.fn();

vi.mock('@aiflow/queue', () => ({
  getCodeQueue: () => ({ add: queueAdd }),
}));

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({
    task: { findFirst: taskFindFirst, findMany: taskFindMany },
    taskDependency: { findMany: depFindMany },
  }),
  getPublicClient: () => ({ projectMeta: { findUnique: vi.fn() } }),
}));

const { enqueueRunPlan, listReadyTaskIds } = await import('./run-plan');

const CTX = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  giteaOwner: 'aistudio',
  giteaRepo: 'demo',
  giteaDefaultBranch: 'main',
};

beforeEach(() => {
  queueAdd.mockResolvedValue({ id: 'job-1' });
  taskFindFirst.mockResolvedValue({ id: 't1', status: 'PENDING' });
  taskFindMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
  depFindMany.mockResolvedValue([
    { dependentId: 't2', prerequisite: { status: 'PENDING', deletedAt: null } },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('listReadyTaskIds', () => {
  it('skips tasks whose HARD dep is not DONE', async () => {
    const ids = await listReadyTaskIds(CTX.schemaName);
    expect(ids).toEqual(['t1']);
  });

  it('includes a task when its HARD dep is DONE', async () => {
    depFindMany.mockResolvedValue([
      { dependentId: 't2', prerequisite: { status: 'DONE', deletedAt: null } },
    ]);
    const ids = await listReadyTaskIds(CTX.schemaName);
    expect(ids).toEqual(['t1', 't2']);
  });
});

describe('enqueueRunPlan', () => {
  it('enqueues live jobs for ready tasks only', async () => {
    const result = await enqueueRunPlan(CTX);
    expect(result.taskIds).toEqual(['t1']);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledWith(
      'code:execute',
      expect.objectContaining({ taskId: 't1', dryRun: false }),
      expect.any(Object),
    );
  });
});
