import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queueAdd = vi.fn();
const taskFindMany = vi.fn();
const specFindFirst = vi.fn();

vi.mock('@aiflow/queue', () => ({
  getPlanQueue: () => ({ add: queueAdd }),
}));

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({
    task: { findMany: taskFindMany },
    specification: { findFirst: specFindFirst },
  }),
}));

const { enqueuePlan, listTasks } = await import('./service');
const { PlanSpecRequiredError } = await import('./types');

const SCHEMA = 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  queueAdd.mockResolvedValue({ id: 'job-1' });
  taskFindMany.mockResolvedValue([]);
  specFindFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('listTasks', () => {
  it('maps dependency titles and skips soft-deleted prerequisites', async () => {
    taskFindMany.mockResolvedValue([
      {
        id: 't1',
        title: 'API',
        status: 'PENDING',
        priority: 'HIGH',
        sortOrder: 1,
        specificationId: 's1',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        dependsOn: [
          { prerequisite: { title: 'Model', deletedAt: null } },
          { prerequisite: { title: 'Old', deletedAt: new Date() } },
        ],
      },
    ]);
    const items = await listTasks(SCHEMA);
    expect(items).toHaveLength(1);
    expect(items[0].dependencyTitles).toEqual(['Model']);
    expect(items[0].status).toBe('PENDING');
  });
});

describe('enqueuePlan', () => {
  it('enqueues plan:generate for latest approved spec', async () => {
    specFindFirst.mockResolvedValue({ id: 'spec-1', version: 3 });
    const result = await enqueuePlan('proj-1', SCHEMA);
    expect(result.specificationId).toBe('spec-1');
    expect(result.specificationVersion).toBe(3);
    expect(queueAdd).toHaveBeenCalledWith(
      'plan:generate',
      expect.objectContaining({
        projectId: 'proj-1',
        schemaName: SCHEMA,
        specificationId: 'spec-1',
        specificationVersion: 3,
      }),
      expect.objectContaining({ jobId: expect.stringMatching(/^plan-spec-1-/) }),
    );
  });

  it('throws when no approved specification', async () => {
    await expect(enqueuePlan('proj-1', SCHEMA)).rejects.toBeInstanceOf(PlanSpecRequiredError);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('looks up a specific version when provided', async () => {
    specFindFirst.mockResolvedValue({ id: 'spec-2', version: 2 });
    await enqueuePlan('proj-1', SCHEMA, { version: 2 });
    expect(specFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 2, approvedAt: { not: null } }),
      }),
    );
  });
});
