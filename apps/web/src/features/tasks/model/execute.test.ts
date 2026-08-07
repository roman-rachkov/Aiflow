import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn();
const taskFindFirst = vi.fn();
const metaFindUnique = vi.fn();

vi.mock('@aiflow/queue', () => ({
  getCodeQueue: () => ({ add: queueAdd }),
}));

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({
    task: { findFirst: taskFindFirst },
  }),
  getPublicClient: () => ({
    projectMeta: { findUnique: metaFindUnique },
  }),
}));

const { enqueueConfirm, enqueueExecute, resolveCodeContext } = await import('./execute');
const { CodeConflictError, CodeTaskNotFoundError, CodeWrongStatusError } = await import('./types');

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
  metaFindUnique.mockResolvedValue({
    id: 'proj-1',
    ownerId: 'u1',
    schemaName: CTX.schemaName,
    giteaOwner: 'aistudio',
    giteaRepo: 'demo',
    giteaDefaultBranch: 'main',
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveCodeContext', () => {
  it('returns gitea identity for owner', async () => {
    const ctx = await resolveCodeContext('proj-1', 'u1');
    expect(ctx).toMatchObject({ giteaRepo: 'demo', schemaName: CTX.schemaName });
  });
});

describe('enqueueExecute', () => {
  it('enqueues dry-run code:execute', async () => {
    const result = await enqueueExecute(CTX, 't1', true);
    expect(result.dryRun).toBe(true);
    expect(queueAdd).toHaveBeenCalledWith(
      'code:execute',
      expect.objectContaining({ taskId: 't1', dryRun: true }),
      expect.objectContaining({ jobId: expect.stringMatching(/^code-t1-dry-/) }),
    );
  });

  it('rejects IN_PROGRESS', async () => {
    taskFindFirst.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' });
    await expect(enqueueExecute(CTX, 't1', true)).rejects.toBeInstanceOf(CodeConflictError);
  });

  it('rejects missing task', async () => {
    taskFindFirst.mockResolvedValue(null);
    await expect(enqueueExecute(CTX, 'missing', true)).rejects.toBeInstanceOf(
      CodeTaskNotFoundError,
    );
  });
});

describe('enqueueConfirm', () => {
  it('requires AWAITING_REVIEW', async () => {
    taskFindFirst.mockResolvedValue({ id: 't1', status: 'PENDING' });
    await expect(enqueueConfirm(CTX, 't1')).rejects.toBeInstanceOf(CodeWrongStatusError);
  });

  it('enqueues live run after dry-run', async () => {
    taskFindFirst.mockResolvedValue({ id: 't1', status: 'AWAITING_REVIEW' });
    const result = await enqueueConfirm(CTX, 't1');
    expect(result.dryRun).toBe(false);
    expect(queueAdd).toHaveBeenCalledWith(
      'code:execute',
      expect.objectContaining({ dryRun: false }),
      expect.any(Object),
    );
  });
});
