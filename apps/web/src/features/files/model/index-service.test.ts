import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the synchronous indexing pipeline (task 9). The Prisma client,
 * MinIO fetch, and the ZAI embedding provider are all stubbed — these tests
 * assert the call sequence and the atomic-replace invariant, not real PG I/O.
 *
 * `$transaction` here takes the CALLBACK form the service uses
 * (`client.$transaction(async (tx) => ...)`) and invokes the callback with the
 * same fake client as `tx`, so `tx.documentChunk.*` and `tx.$executeRaw`
 * resolve against the same stubs. `findUnique` is called twice with different
 * selects (loadFileAndDocument vs. runIndex) — the mock returns one row that
 * satisfies both, keyed on the `where.id` so both selects see the same data.
 */

// `vi.hoisted` runs before the hoisted `vi.mock` factories, so the stubs are
// initialized and referenceable inside those factories without TDZ errors.
/** Shape of the stubbed Prisma client (callback-form $transaction included). */
interface FakeClient {
  userFile: { findUnique: ReturnType<typeof vi.fn> };
  document: { update: ReturnType<typeof vi.fn> };
  documentChunk: { create: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: <T>(cb: (tx: FakeClient) => Promise<T>) => Promise<T>;
}

const {
  findUnique,
  documentUpdate,
  chunkCreate,
  chunkDeleteMany,
  executeRaw,
  fakeClient,
  getObject,
  embed,
} = vi.hoisted(() => {
  const findUnique = vi.fn();
  const documentUpdate = vi.fn();
  const chunkCreate = vi.fn();
  const chunkDeleteMany = vi.fn();
  const executeRaw = vi.fn();
  // Annotated to break the `typeof fakeClient` self-reference in the callback type.
  const fakeClient: FakeClient = {
    userFile: { findUnique },
    document: { update: documentUpdate },
    documentChunk: { create: chunkCreate, deleteMany: chunkDeleteMany },
    $executeRaw: executeRaw,
    // Callback-form $transaction: invoke the callback with the fake client as
    // `tx` so `tx.documentChunk.*` and `tx.$executeRaw` hit the same stubs.
    $transaction: async <T>(cb: (tx: FakeClient) => Promise<T>): Promise<T> => cb(fakeClient),
  };
  return {
    findUnique,
    documentUpdate,
    chunkCreate,
    chunkDeleteMany,
    executeRaw,
    fakeClient,
    getObject: vi.fn(),
    embed: vi.fn(),
  };
});

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

vi.mock('@/shared/minio', () => ({ getObject }));

vi.mock('@aiflow/ai-roles', () => ({
  createProviderFromEnv: vi.fn(() => ({ embed })),
}));

const { indexDocument } = await import('./index-service');

/** The row returned by both `findUnique` selects. `document` is only read by loadFileAndDocument. */
const ROW = {
  id: 'f1',
  storageKey: 'project_abc/abc-123',
  mimeType: 'text/plain',
  document: { id: 'd1' },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('indexDocument — happy path', () => {
  it('indexes a text/plain file: INDEXING then INDEXED, delete-before-create, one create per chunk, vector-literal shape', async () => {
    getObject.mockResolvedValue(Buffer.from('Some text. More text here.'));
    findUnique.mockResolvedValue(ROW);
    // `chunkText` is real, so derive the vector count from the chunks it produced:
    // one 768-dim vector per input text. This keeps the test independent of the
    // exact split count for such a short string.
    embed.mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map((_, i) => Array.from({ length: 768 }, () => i))),
    );
    chunkCreate.mockResolvedValue({ id: 'c0' });

    const result = await indexDocument('project_abc', 'f1');

    expect(result.status).toBe('INDEXED');
    expect(result.chunkCount).toBeGreaterThan(0);

    // `embed` saw the same number of chunks the service reports back,
    // each prefixed with nomic's `search_document:` recommendation.
    const embedInputs = embed.mock.calls[0][0] as string[];
    expect(result.chunkCount).toBe(embedInputs.length);
    expect(embedInputs.every((t) => t.startsWith('search_document: '))).toBe(true);

    const statuses = documentUpdate.mock.calls.map((c) => {
      const arg = c[0] as { data: { status: string } };
      return arg.data.status;
    });
    expect(statuses).toEqual(['INDEXING', 'INDEXED']);

    expect(chunkDeleteMany).toHaveBeenCalledTimes(1);
    expect(chunkDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      chunkCreate.mock.invocationCallOrder[0],
    );
    expect(chunkCreate).toHaveBeenCalledTimes(embedInputs.length);

    expect(executeRaw).toHaveBeenCalledTimes(embedInputs.length);
    for (const call of executeRaw.mock.calls) {
      // Tagged template: call[0] is the cooked strings array, call[1..] the
      // interpolated values. The service renders
      //   `... SET embedding = ${literal}::vector WHERE id = ${id}`
      // so the joined template strings contain the `::vector` cast ...
      const sql = (call[0] as readonly string[]).join('');
      expect(sql).toContain('::public.vector');
      // ... and the first interpolation is the '[...]' vector literal itself.
      expect(call[1]).toMatch(/^\[[-0-9.eE,]+\]$/);
    }
  });
});

describe('indexDocument — failure modes', () => {
  it('returns FAILED and writes no chunks for an unsupported MIME type', async () => {
    findUnique.mockResolvedValue({ ...ROW, mimeType: 'image/png' });

    const result = await indexDocument('project_abc', 'f1');

    expect(result.status).toBe('FAILED');
    expect(result.reason).toBeTruthy();
    expect(chunkCreate).not.toHaveBeenCalled();
  });

  it('returns FAILED, marks the document FAILED, and commits no partial chunks when embed rejects', async () => {
    getObject.mockResolvedValue(Buffer.from('Some text. More text here.'));
    findUnique.mockResolvedValue(ROW);
    embed.mockRejectedValue(new Error('provider down'));

    const result = await indexDocument('project_abc', 'f1');

    expect(result).toEqual({
      documentId: 'd1',
      status: 'FAILED',
      chunkCount: 0,
      reason: 'provider down',
    });
    expect(documentUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    // deleteMany runs first inside the transaction, embed threw before any create -> no chunks.
    expect(chunkCreate).not.toHaveBeenCalled();
  });
});
