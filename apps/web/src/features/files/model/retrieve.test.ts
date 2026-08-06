import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the RAG retrieval pipeline (task 10). The per-project Prisma
 * client and the ZAI embedding provider are stubbed — these tests assert the
 * pgvector SQL shape (cosine `<=>`, `::vector` cast, INDEXED + soft-delete
 * filters, parameterized `LIMIT $1` with `k`) and the failure-safety contract
 * (embed rejection → empty context, never throws). Mirrors the
 * index-service.test.ts hoisted-stub pattern.
 */

interface FakeClient {
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
}

const { embed, queryRawUnsafe, fakeClient } = vi.hoisted(() => {
  const embed = vi.fn();
  const queryRawUnsafe = vi.fn();
  const fakeClient: FakeClient = { $queryRawUnsafe: queryRawUnsafe };
  return { embed, queryRawUnsafe, fakeClient };
});

vi.mock('@aiflow/db', () => ({
  getProjectClient: vi.fn(() => fakeClient),
}));

vi.mock('@aiflow/ai-roles', () => ({
  createZaiProvider: vi.fn(() => ({ embed })),
}));

const { retrieveChunks, retrieveContext } = await import('./retrieve');

/** A 1536-dim vector literal the provider mock resolves with. */
const VEC = Array.from({ length: 1536 }, () => 0.5);

afterEach(() => {
  vi.clearAllMocks();
});

describe('retrieveChunks — SQL shape', () => {
  it('issues a cosine-distance SELECT over INDEXED, non-deleted docs with LIMIT $1 = k (default 5)', async () => {
    embed.mockResolvedValue([VEC]);
    queryRawUnsafe.mockResolvedValue([]);

    await retrieveChunks('project_x', 'q');

    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, k] = queryRawUnsafe.mock.calls[0] as [string, number];

    // Soft-delete + status filters. `deletedAt` is a quoted identifier in the
    // source SQL (`WHERE "deletedAt" IS NULL ...`); match the actual shape.
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(sql).toContain("status = 'INDEXED'");
    // pgvector cosine distance + vector cast, both in SELECT and ORDER BY.
    expect(sql).toContain('<=>');
    expect(sql).toContain('::vector');
    // k is bound as the LIMIT parameter, never inlined.
    expect(sql).toContain('LIMIT $1');
    expect(k).toBe(5);
  });

  it('honors an explicit k by passing it as the LIMIT parameter', async () => {
    embed.mockResolvedValue([VEC]);
    queryRawUnsafe.mockResolvedValue([]);

    await retrieveChunks('project_x', 'q', 3);

    const [, k] = queryRawUnsafe.mock.calls[0] as [string, number];
    expect(k).toBe(3);
  });
});

describe('retrieveContext — empty result', () => {
  it("returns '' when no chunks match", async () => {
    embed.mockResolvedValue([VEC]);
    queryRawUnsafe.mockResolvedValue([]);

    const result = await retrieveContext('project_x', 'q');

    expect(result).toBe('');
  });
});

describe('retrieveContext — formatted block', () => {
  it('renders each chunk as a numbered fragment under the Russian header', async () => {
    embed.mockResolvedValue([VEC]);
    queryRawUnsafe.mockResolvedValue([
      { id: 'c1', content: 'Alpha text', distance: 0.1 },
      { id: 'c2', content: 'Beta text', distance: 0.2 },
    ]);

    const result = await retrieveContext('project_x', 'q');

    expect(result).toContain('Контекст из загруженных документов');
    expect(result).toContain('[Фрагмент 1]');
    expect(result).toContain('Alpha text');
    expect(result).toContain('[Фрагмент 2]');
    expect(result).toContain('Beta text');
  });
});

describe('embed rejection — failure safety', () => {
  it('retrieveContext returns "" (never throws) when embed rejects', async () => {
    embed.mockRejectedValue(new Error('provider down'));

    await expect(retrieveContext('project_x', 'q')).resolves.toBe('');
  });

  it('retrieveChunks returns [] (never throws) when embed rejects', async () => {
    embed.mockRejectedValue(new Error('provider down'));

    await expect(retrieveChunks('project_x', 'q')).resolves.toEqual([]);
    // No DB call should have happened once embed failed.
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });
});
