import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the projects service. The Prisma client and the schema
 * provisioning functions are stubbed — these tests are about the query shapes
 * (soft-delete filter, ownership) and the create-time compensation saga, not
 * about talking to PostgreSQL. Integration against a real DB is a separate
 * concern; the mock shape mirrors features/auth/model/guards.test.ts.
 */

const findMany = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();

const createProjectSchema = vi.fn<() => Promise<void>>();
const dropProjectSchema = vi.fn<() => Promise<void>>();
const evictProjectClient = vi.fn<() => Promise<void>>();
const generateProjectSchemaName = vi.fn<() => string>();

vi.mock('@aiflow/db', () => ({
  getPublicClient: () => ({
    projectMeta: { findMany, findUnique, create, update },
  }),
  createProjectSchema,
  dropProjectSchema,
  evictProjectClient,
  generateProjectSchemaName,
}));

const { listProjects, getProject, createProject, removeProject } = await import('./service');

const ROW = {
  id: 'p1',
  name: 'Demo',
  description: 'd',
  status: 'ACTIVE' as const,
  schemaName: 'project_abc',
  ownerId: 'u1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listProjects', () => {
  it('filters by owner and deletedAt: null, newest first', async () => {
    findMany.mockResolvedValue([ROW]);

    await listProjects('u1');

    expect(findMany).toHaveBeenCalledWith({
      where: { ownerId: 'u1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('maps rows to the view (no schemaName / ownerId / deletedAt)', async () => {
    findMany.mockResolvedValue([ROW]);

    const [project] = await listProjects('u1');

    expect(project).toEqual({
      id: 'p1',
      name: 'Demo',
      description: 'd',
      status: 'ACTIVE',
      createdAt: ROW.createdAt,
      updatedAt: ROW.updatedAt,
    });
    expect(project).not.toHaveProperty('schemaName');
  });
});

describe('getProject', () => {
  it('returns the view for the owner', async () => {
    findUnique.mockResolvedValue(ROW);

    await expect(getProject('p1', 'u1')).resolves.toMatchObject({ id: 'p1' });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'p1', deletedAt: null } });
  });

  it('returns null for a missing project', async () => {
    findUnique.mockResolvedValue(null);
    await expect(getProject('gone', 'u1')).resolves.toBeNull();
  });

  it('returns null when the project belongs to someone else (no existence leak)', async () => {
    findUnique.mockResolvedValue({ ...ROW, ownerId: 'someone-else' });
    await expect(getProject('p1', 'u1')).resolves.toBeNull();
  });
});

describe('createProject', () => {
  it('provisions the schema, then inserts the row, in that order', async () => {
    generateProjectSchemaName.mockReturnValue('project_new');
    createProjectSchema.mockResolvedValue(undefined);
    create.mockResolvedValue(ROW);

    await createProject({ name: 'Demo', ownerId: 'u1' });

    expect(createProjectSchema).toHaveBeenCalledWith('project_new');
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Demo',
        description: null,
        schemaName: 'project_new',
        ownerId: 'u1',
        status: 'ACTIVE',
      },
    });
    expect(dropProjectSchema).not.toHaveBeenCalled();
  });

  it('drops the schema to compensate when the insert fails', async () => {
    generateProjectSchemaName.mockReturnValue('project_new');
    createProjectSchema.mockResolvedValue(undefined);
    create.mockRejectedValue(new Error('insert failed'));
    dropProjectSchema.mockResolvedValue(undefined);

    await expect(createProject({ name: 'Demo', ownerId: 'u1' })).rejects.toThrow('insert failed');
    expect(dropProjectSchema).toHaveBeenCalledWith('project_new');
  });

  it('still rethrows the original error if the compensating drop also fails', async () => {
    generateProjectSchemaName.mockReturnValue('project_new');
    createProjectSchema.mockResolvedValue(undefined);
    create.mockRejectedValue(new Error('insert failed'));
    dropProjectSchema.mockRejectedValue(new Error('drop failed'));

    await expect(createProject({ name: 'Demo', ownerId: 'u1' })).rejects.toThrow('insert failed');
  });
});

describe('removeProject', () => {
  it('soft-deletes (sets deletedAt) and evicts the project client', async () => {
    findUnique.mockResolvedValue({ id: 'p1', ownerId: 'u1', schemaName: 'project_abc' });
    update.mockResolvedValue(undefined);
    evictProjectClient.mockResolvedValue(undefined);

    await expect(removeProject('p1', 'u1')).resolves.toBe(true);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(evictProjectClient).toHaveBeenCalledWith('project_abc');
  });

  it('returns false and does nothing for a foreign project', async () => {
    findUnique.mockResolvedValue({ id: 'p1', ownerId: 'someone-else', schemaName: 'project_abc' });

    await expect(removeProject('p1', 'u1')).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(evictProjectClient).not.toHaveBeenCalled();
  });

  it('returns false for a missing project', async () => {
    findUnique.mockResolvedValue(null);

    await expect(removeProject('gone', 'u1')).resolves.toBe(false);
  });
});
