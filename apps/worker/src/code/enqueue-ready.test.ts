import { afterEach, describe, expect, it, vi } from 'vitest';

const taskFindMany = vi.fn();
const depFindMany = vi.fn();

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({
    task: { findMany: taskFindMany },
    taskDependency: { findMany: depFindMany },
  }),
  getPublicClient: () => ({ projectMeta: { findUnique: vi.fn() } }),
}));

vi.mock('@aiflow/queue', () => ({
  getCodeQueue: () => ({ add: vi.fn() }),
}));

const { listReadyTaskIds } = await import('./enqueue-ready');

afterEach(() => {
  vi.clearAllMocks();
});

describe('listReadyTaskIds', () => {
  it('returns PENDING tasks without unfinished HARD deps', async () => {
    taskFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    depFindMany.mockResolvedValue([
      { dependentId: 'b', prerequisite: { status: 'IN_PROGRESS', deletedAt: null } },
    ]);
    await expect(listReadyTaskIds('project_x')).resolves.toEqual(['a']);
  });
});
