import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * RAG smoke test (task 17). Drives the files-slice half of the primary path —
 * `createUserFile` → `indexDocument` → `retrieveContext` — end to end in mock
 * mode. The per-service tests already prove Prisma correctness; this one proves
 * the WIRING between the three steps against a shared fake client whose returns
 * are reconfigured inline at each step (a real re-index reads back what the
 * previous index wrote, but here each step is stubbed to the canned row the
 * next step expects, so the chain is exercised as the route would see it).
 *
 * Mirrors the `vi.hoisted` + callback-`$transaction` stub pattern of
 * `index-service.test.ts`, extended with `service`'s array-`$transaction`
 * (create) and `retrieve`'s `$queryRawUnsafe`. Cross-slice wiring
 * (specifications) lives in `features/specifications/model/spec-smoke.test.ts`
 * to keep this test within its own slice (`boundaries/dependencies`).
 */

/** Shape of the stubbed Prisma client used by all three steps. */
interface FakeClient {
  userFile: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  document: { update: ReturnType<typeof vi.fn> };
  documentChunk: {
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $executeRaw: ReturnType<typeof vi.fn>;
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
  // Array form (used by `createUserFile`) AND callback form (used by
  // `indexDocument`) share one `$transaction` stub: arrays are awaited in
  // order, callbacks are invoked with this same client as `tx`.
  $transaction: <T>(arg: Promise<T>[] | ((tx: FakeClient) => Promise<T>)) => Promise<T | T[]>;
}

const {
  userFileCreate,
  findUnique,
  chunkCreate,
  executeRaw,
  queryRawUnsafe,
  getObject,
  embed,
  fakeClient,
} = vi.hoisted(() => {
  const userFileCreate = vi.fn();
  const findUnique = vi.fn();
  const documentUpdate = vi.fn();
  const chunkCreate = vi.fn();
  const chunkDeleteMany = vi.fn();
  const executeRaw = vi.fn();
  const queryRawUnsafe = vi.fn();
  const getObject = vi.fn();
  const embed = vi.fn();
  const fakeClient: FakeClient = {
    userFile: { create: userFileCreate, findUnique },
    document: { update: documentUpdate },
    documentChunk: { create: chunkCreate, deleteMany: chunkDeleteMany },
    $executeRaw: executeRaw,
    $queryRawUnsafe: queryRawUnsafe,
    $transaction: async <T>(
      arg: Promise<T>[] | ((tx: FakeClient) => Promise<T>),
    ): Promise<T | T[]> => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(fakeClient);
    },
  };
  return {
    userFileCreate,
    findUnique,
    chunkCreate,
    executeRaw,
    queryRawUnsafe,
    getObject,
    embed,
    fakeClient,
  };
});

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

vi.mock('@/shared/minio', () => ({ getObject, putObject: vi.fn() }));

vi.mock('@aiflow/ai-roles', () => ({
  createProviderFromEnv: vi.fn(() => ({ embed })),
}));

const { createUserFile } = await import('./service');
const { indexDocument } = await import('./index-service');
const { retrieveContext } = await import('./retrieve');

afterEach(() => {
  vi.clearAllMocks();
});

describe('RAG smoke: upload -> index -> retrieve', () => {
  it('runs the files-slice primary path end to end in mock mode', async () => {
    // 1. createUserFile — array $transaction resolves the nested create.
    userFileCreate.mockResolvedValue({
      id: 'f1',
      fileName: 'notes.txt',
      fileSize: 5,
      mimeType: 'text/plain',
      storageKey: 'project_x/k',
      createdAt: new Date(),
    });
    const file = await createUserFile('project_x', {
      fileName: 'notes.txt',
      fileSize: 5,
      mimeType: 'text/plain',
      storageKey: 'project_x/k',
    });
    expect(file.id).toBe('f1');

    // 2. indexDocument — load bytes, chunk, embed, writeChunks in callback $transaction.
    getObject.mockResolvedValue(Buffer.from('Some notes text. More notes here.'));
    findUnique.mockResolvedValue({
      id: 'f1',
      storageKey: 'project_x/k',
      mimeType: 'text/plain',
      document: { id: 'd1' },
    });
    embed.mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => Array.from({ length: 768 }, (_, i) => i / 768))),
    );
    chunkCreate.mockResolvedValue({ id: 'c1' });

    const indexResult = await indexDocument('project_x', 'f1');
    expect(indexResult.status).toBe('INDEXED');
    expect(indexResult.chunkCount).toBeGreaterThan(0);
    expect(executeRaw).toHaveBeenCalled();
    // Tagged template: call[0] is the cooked strings array; the joined SQL
    // must contain the `::public.vector` cast the indexer writes per chunk.
    const firstCall = executeRaw.mock.calls[0];
    expect((firstCall[0] as readonly string[]).join('')).toContain('::public.vector');

    // 3. retrieveContext — seed $queryRawUnsafe with one chunk; embed re-stubbed
    // because the per-test `clearAllMocks` in earlier runs is not shared here.
    embed.mockResolvedValue([Array.from({ length: 768 }, (_, i) => i / 768)]);
    queryRawUnsafe.mockResolvedValue([
      { id: 'c1', content: 'Some notes text', distance: 0.1, path: 'notes.txt' },
    ]);

    const context = await retrieveContext('project_x', 'notes');
    expect(context).toContain('Контекст из загруженных документов');
    expect(context).toContain('Some notes text');
    expect(context).toContain('notes.txt');
  });
});
