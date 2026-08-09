import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the chat service. The Prisma client is stubbed via
 * `vi.mock('@aiflow/db', ...)` — these tests are about query shapes
 * (soft-delete filter, chronological ordering) and the create-time token +
 * thread handling, not about talking to PostgreSQL. The mock mirrors
 * features/projects/model/service.test.ts.
 */

const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({ chatMessage: { findMany, findFirst, create, update, updateMany } }),
}));

const { deleteMessage, listMessages, listMessagesByThread, saveMessage, updateMessageContent } =
  await import('./service');

const ROW = {
  id: 'm1',
  role: 'USER' as const,
  content: 'hello',
  threadId: 't1',
  parentId: null,
  tokensIn: 12,
  tokensOut: 34,
  createdAt: new Date('2026-01-01'),
  deletedAt: null,
};

/** Build the expected view for a row, dropping token + deletedAt fields. */
function viewOf(r: {
  id: string;
  role: string;
  content: string;
  threadId: string | null;
  parentId: string | null;
  createdAt: Date;
}): {
  id: string;
  role: string;
  content: string;
  threadId: string | null;
  parentId: string | null;
  createdAt: Date;
} {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    threadId: r.threadId,
    parentId: r.parentId,
    createdAt: r.createdAt,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('listMessagesByThread', () => {
  it('filters by thread, excludes soft-deleted, orders oldest first', async () => {
    findMany.mockResolvedValue([ROW]);

    await listMessagesByThread('project_abc', 't1');

    expect(findMany).toHaveBeenCalledWith({
      where: { threadId: 't1', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  });
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

    expect(result).toEqual([viewOf(older), viewOf(newer)]);
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
  it('defaults token counts and thread/parent to null when not supplied', async () => {
    create.mockResolvedValue(ROW);

    await saveMessage('project_abc', { role: 'USER', content: 'hello' });

    expect(create).toHaveBeenCalledWith({
      data: {
        role: 'USER',
        content: 'hello',
        threadId: null,
        parentId: null,
        tokensIn: null,
        tokensOut: null,
      },
    });
  });

  it('passes through supplied token counts and thread/parent links', async () => {
    create.mockResolvedValue(ROW);
    const input = {
      role: 'ASSISTANT' as const,
      content: 'response',
      threadId: 't1',
      parentId: 'm1',
      tokensIn: 42,
      tokensOut: 88,
    };

    await saveMessage('project_abc', input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it('returns the created row mapped to the view', async () => {
    create.mockResolvedValue(ROW);

    const message = await saveMessage('project_abc', { role: 'USER', content: 'hello' });

    expect(message).toEqual(viewOf(ROW));
    expect(message).not.toHaveProperty('tokensIn');
    expect(message).not.toHaveProperty('tokensOut');
  });
});

describe('deleteMessage', () => {
  it('soft-deletes by setting deletedAt (never .delete())', async () => {
    await deleteMessage('project_abc', 'm1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe('updateMessageContent', () => {
  it('updates content in place and returns the view', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ ...ROW, content: 'edited' });

    const result = await updateMessageContent('project_abc', 'm1', 'edited');

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', deletedAt: null },
      data: { content: 'edited' },
    });
    expect(result?.content).toBe('edited');
  });

  it('returns null when the message is missing (count 0)', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await updateMessageContent('project_abc', 'missing', 'x');

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
