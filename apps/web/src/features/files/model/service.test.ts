import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the files service. The Prisma client is stubbed via
 * `vi.mock('@aiflow/db', ...)` — these tests are about query shapes
 * (soft-delete filter, newest-first ordering, document status include) and
 * the atomic nested-create (UserFile + Document), not about talking to
 * PostgreSQL. The mock mirrors features/chat/model/service.test.ts.
 *
 * `$transaction` accepts an array of already-constructed promises (the form
 * the service uses, `client.$transaction([ client.userFile.create(...) ])`)
 * and resolves them in order, returning the resolved-value array. That lets
 * us assert on both the `create` call args and the `[0]` destructure.
 */

const findMany = vi.fn();
const create = vi.fn();

const fakeClient = {
  userFile: { findMany, create },
  $transaction: async <T>(arr: Promise<T>[]): Promise<T[]> => Promise.all(arr),
};

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

const { listFiles, createUserFile } = await import('./service');

const ROW = {
  id: 'f1',
  fileName: 'notes.txt',
  fileSize: 12,
  mimeType: 'text/plain',
  storageKey: 'project_abc/abc-123',
  createdAt: new Date('2026-01-01'),
  deletedAt: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listFiles', () => {
  it('filters soft-deleted rows, orders newest first, and includes document status', async () => {
    findMany.mockResolvedValue([{ ...ROW, document: null }]);

    await listFiles('project_abc');

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { document: { select: { status: true } } },
    });
  });

  it('explicitly filters deletedAt: null (soft-delete invariant)', async () => {
    findMany.mockResolvedValue([]);

    await listFiles('project_abc');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });

  it('defaults indexStatus to PENDING when the document relation is null', async () => {
    findMany.mockResolvedValue([{ ...ROW, document: null }]);

    const [file] = await listFiles('project_abc');

    expect(file).toEqual({
      id: 'f1',
      fileName: 'notes.txt',
      fileSize: 12,
      mimeType: 'text/plain',
      indexStatus: 'PENDING',
      createdAt: ROW.createdAt,
    });
  });

  it('uses the document status when present', async () => {
    findMany.mockResolvedValue([{ ...ROW, document: { status: 'INDEXED' } }]);

    const [file] = await listFiles('project_abc');

    expect(file.indexStatus).toBe('INDEXED');
  });

  it('maps rows in the order Prisma returned them', async () => {
    const a = { ...ROW, id: 'a', document: { status: 'PENDING' as const } };
    const b = { ...ROW, id: 'b', document: { status: 'INDEXED' as const } };
    findMany.mockResolvedValue([a, b]);

    const result = await listFiles('project_abc');

    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result).toHaveLength(2);
  });
});

describe('createUserFile', () => {
  it('creates a UserFile with the linked Document in one nested create', async () => {
    create.mockResolvedValue(ROW);

    await createUserFile('project_abc', {
      fileName: 'notes.txt',
      fileSize: 12,
      mimeType: 'text/plain',
      storageKey: 'project_abc/abc-123',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        fileName: 'notes.txt',
        fileSize: 12,
        mimeType: 'text/plain',
        storageKey: 'project_abc/abc-123',
        document: {
          create: { sourceType: 'UPLOAD', title: 'notes.txt', status: 'PENDING' },
        },
      },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns the created row mapped to the view', async () => {
    create.mockResolvedValue(ROW);

    const view = await createUserFile('project_abc', {
      fileName: 'notes.txt',
      fileSize: 12,
      mimeType: 'text/plain',
      storageKey: 'project_abc/abc-123',
    });

    expect(view).toEqual({
      id: 'f1',
      fileName: 'notes.txt',
      fileSize: 12,
      mimeType: 'text/plain',
      storageKey: 'project_abc/abc-123',
      createdAt: ROW.createdAt,
    });
  });
});
