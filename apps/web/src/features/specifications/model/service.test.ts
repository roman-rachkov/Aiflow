import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the specification service. The Prisma client is stubbed via
 * `vi.mock('@aiflow/db', ...)` — these tests are about query shapes
 * (soft-delete filter, version-desc ordering, `findFirst` for version lookup,
 * `aggregate` `_max` for the next version) and the `toView` / `toListItemView`
 * projections, not about talking to PostgreSQL. The mock mirrors
 * features/chat/model/service.test.ts and features/files/model/service.test.ts.
 */

const findMany = vi.fn();
const findFirst = vi.fn();
const aggregate = vi.fn();
const create = vi.fn();

const fakeClient = {
  specification: { findMany, findFirst, aggregate, create },
};

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

const { listSpecifications, getSpecificationByVersion, createSpecificationVersion } =
  await import('./service');

const ROW = {
  id: 's1',
  version: 2,
  content: '# SPEC\nlong body...',
  createdAt: new Date('2026-01-02'),
  createdBy: 'AI' as const,
  approvedAt: null,
  deletedAt: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listSpecifications', () => {
  it('filters soft-deleted rows, orders newest version first, and maps to the list view', async () => {
    findMany.mockResolvedValue([{ ...ROW }]);

    const result = await listSpecifications('project_x');

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { version: 'desc' },
    });
    expect(result).toEqual([
      {
        id: 's1',
        version: 2,
        createdAt: ROW.createdAt,
        createdBy: 'AI',
        approvedAt: null,
      },
    ]);
  });

  it('drops content from the list item view (bodies are large)', async () => {
    findMany.mockResolvedValue([{ ...ROW }]);

    const [item] = await listSpecifications('project_x');

    expect(item).not.toHaveProperty('content');
  });
});

describe('getSpecificationByVersion', () => {
  it('finds a non-deleted row by version and returns the full view', async () => {
    findFirst.mockResolvedValue({ ...ROW });

    const result = await getSpecificationByVersion('project_x', 2);

    expect(findFirst).toHaveBeenCalledWith({
      where: { version: 2, deletedAt: null },
    });
    expect(result).toEqual({
      id: 's1',
      version: 2,
      content: ROW.content,
      createdAt: ROW.createdAt,
      createdBy: 'AI',
    });
  });

  it('returns null when the version is missing or soft-deleted', async () => {
    findFirst.mockResolvedValue(null);

    const result = await getSpecificationByVersion('project_x', 99);

    expect(result).toBeNull();
  });
});

describe('createSpecificationVersion', () => {
  it('appends max(existing) + 1 authored by the AI', async () => {
    aggregate.mockResolvedValue({ _max: { version: 3 } });
    create.mockResolvedValue({ ...ROW, version: 4 });

    await createSpecificationVersion('project_x', '# new SPEC');

    expect(aggregate).toHaveBeenCalledWith({ _max: { version: true } });
    expect(create).toHaveBeenCalledWith({
      data: { version: 4, content: '# new SPEC', createdBy: 'AI' },
    });
  });

  it('starts at version 1 when the table is empty (Prisma _max is null)', async () => {
    aggregate.mockResolvedValue({ _max: { version: null } });
    create.mockResolvedValue({ ...ROW, version: 1 });

    await createSpecificationVersion('project_x', '# first SPEC');

    expect(create).toHaveBeenCalledWith({
      data: { version: 1, content: '# first SPEC', createdBy: 'AI' },
    });
  });
});
