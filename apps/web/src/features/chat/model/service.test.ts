import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the chat service. The Prisma client is stubbed via
 * `vi.mock('@aiflow/db', ...)` — these tests are about query shapes
 * (soft-delete filter, chronological ordering) and the create-time token
 * handling, not about talking to PostgreSQL. The mock mirrors
 * features/projects/model/service.test.ts.
 */

const findMany = vi.fn();
const create = vi.fn();

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({ chatMessage: { findMany, create } }),
}));

const { listMessages, saveMessage } = await import('./service');

const ROW = {
  id: 'm1',
  role: 'USER' as const,
  content: 'hello',
  tokensIn: 12,
  tokensOut: 34,
  createdAt: new Date('2026-01-01'),
  deletedAt: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listMessages', () => {
  it('filters soft-deleted rows and orders oldest first', async () => {
    findMany.mockResolvedValue([ROW]);

    await listMessages('project_abc');

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('maps rows to the view in the order Prisma returned them', async () => {
    const older = { ...ROW, id: 'm1', createdAt: new Date('2026-01-01') };
    const newer = {
      ...ROW,
      id: 'm2',
      role: 'ASSISTANT' as const,
      createdAt: new Date('2026-01-02'),
    };
    findMany.mockResolvedValue([older, newer]);

    const result = await listMessages('project_abc');

    expect(result).toEqual([
      {
        id: 'm1',
        role: 'USER',
        content: 'hello',
        createdAt: older.createdAt,
      },
      {
        id: 'm2',
        role: 'ASSISTANT',
        content: 'hello',
        createdAt: newer.createdAt,
      },
    ]);
  });

  it('does not leak token fields into the view', async () => {
    findMany.mockResolvedValue([ROW]);

    const [message] = await listMessages('project_abc');

    expect(message).not.toHaveProperty('tokensIn');
    expect(message).not.toHaveProperty('tokensOut');
    expect(message).not.toHaveProperty('deletedAt');
  });

  it('explicitly filters deletedAt: null (soft-delete invariant)', async () => {
    findMany.mockResolvedValue([]);

    await listMessages('project_abc');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });
});

describe('saveMessage', () => {
  it('defaults token counts to null when not supplied', async () => {
    create.mockResolvedValue(ROW);

    await saveMessage('project_abc', { role: 'USER', content: 'hello' });

    expect(create).toHaveBeenCalledWith({
      data: {
        role: 'USER',
        content: 'hello',
        tokensIn: null,
        tokensOut: null,
      },
    });
  });

  it('passes through supplied token counts', async () => {
    create.mockResolvedValue(ROW);

    await saveMessage('project_abc', {
      role: 'ASSISTANT',
      content: 'response',
      tokensIn: 42,
      tokensOut: 88,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        role: 'ASSISTANT',
        content: 'response',
        tokensIn: 42,
        tokensOut: 88,
      },
    });
  });

  it('returns the created row mapped to the view', async () => {
    create.mockResolvedValue(ROW);

    const message = await saveMessage('project_abc', {
      role: 'USER',
      content: 'hello',
    });

    expect(message).toEqual({
      id: 'm1',
      role: 'USER',
      content: 'hello',
      createdAt: ROW.createdAt,
    });
    expect(message).not.toHaveProperty('tokensIn');
    expect(message).not.toHaveProperty('tokensOut');
  });
});
