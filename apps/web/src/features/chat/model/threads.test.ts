import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for chat thread CRUD. The Prisma client is stubbed via
 * `vi.mock('@aiflow/db', ...)` — these test query shapes (soft-delete filter,
 * ordering, fork copy) and title derivation, not PostgreSQL.
 */

const findMany = vi.fn();
const findFirst = vi.fn();
const threadCreate = vi.fn();
const threadUpdate = vi.fn();
const threadUpdateMany = vi.fn();
const messageFindMany = vi.fn();
const messageCreate = vi.fn();

function mockClient() {
  return {
    chatThread: {
      findMany,
      findFirst,
      create: threadCreate,
      update: threadUpdate,
      updateMany: threadUpdateMany,
    },
    chatMessage: { findMany: messageFindMany, create: messageCreate },
  };
}

vi.mock('@aiflow/db', () => ({ getProjectClient: () => mockClient() }));

const {
  createThread,
  createThreadWithMessage,
  deleteThread,
  forkThread,
  getThread,
  listThreads,
  updateThread,
} = await import('./threads');

const THREAD_ROW = {
  id: 't1',
  title: 'Главный',
  forkedFromId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  deletedAt: null,
};

const MESSAGE_ROW = {
  id: 'm1',
  role: 'USER' as const,
  content: 'hello',
  threadId: 't1',
  parentId: null,
  createdAt: new Date('2026-01-01'),
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listThreads', () => {
  it('filters soft-deleted and orders by updatedAt desc', async () => {
    findMany.mockResolvedValue([THREAD_ROW]);

    await listThreads('project_abc');

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('does not leak deletedAt into the view', async () => {
    findMany.mockResolvedValue([THREAD_ROW]);

    const [thread] = await listThreads('project_abc');

    expect(thread).not.toHaveProperty('deletedAt');
  });
});

describe('getThread', () => {
  it('filters by id + non-deleted', async () => {
    findFirst.mockResolvedValue(THREAD_ROW);

    await getThread('project_abc', 't1');

    expect(findFirst).toHaveBeenCalledWith({ where: { id: 't1', deletedAt: null } });
  });

  it('returns null when missing', async () => {
    findFirst.mockResolvedValue(null);

    const result = await getThread('project_abc', 'missing');

    expect(result).toBeNull();
  });
});

describe('createThread', () => {
  it('defaults title to "Новый чат" when blank', async () => {
    threadCreate.mockResolvedValue(THREAD_ROW);

    await createThread('project_abc', {});

    expect(threadCreate).toHaveBeenCalledWith({ data: { title: 'Новый чат', forkedFromId: null } });
  });

  it('uses a trimmed title when provided', async () => {
    threadCreate.mockResolvedValue(THREAD_ROW);

    await createThread('project_abc', { title: '  Моя идея  ', forkedFromId: 't0' });

    expect(threadCreate).toHaveBeenCalledWith({
      data: { title: 'Моя идея', forkedFromId: 't0' },
    });
  });
});

describe('createThreadWithMessage', () => {
  it('derives title from the first message and persists both', async () => {
    threadCreate.mockResolvedValue(THREAD_ROW);
    messageCreate.mockResolvedValue(MESSAGE_ROW);

    const result = await createThreadWithMessage('project_abc', {
      role: 'USER',
      content: 'Хочу сделать блог про путешествия',
    });

    expect(threadCreate).toHaveBeenCalledWith({
      data: { title: 'Хочу сделать блог про путешествия', forkedFromId: null },
    });
    expect(messageCreate).toHaveBeenCalledWith({
      data: { role: 'USER', content: 'Хочу сделать блог про путешествия', threadId: 't1' },
    });
    expect(result.thread.id).toBe('t1');
    expect(result.message.threadId).toBe('t1');
  });

  it('truncates long titles to ~60 chars', async () => {
    threadCreate.mockResolvedValue(THREAD_ROW);
    messageCreate.mockResolvedValue(MESSAGE_ROW);
    const long = 'а'.repeat(80);

    await createThreadWithMessage('project_abc', { role: 'USER', content: long });

    const arg = threadCreate.mock.calls[0]?.[0] as { data: { title: string } };
    expect(arg.data.title.length).toBeLessThanOrEqual(60);
    expect(arg.data.title).toContain('…');
  });
});

describe('updateThread', () => {
  it('renames the thread and returns the updated view', async () => {
    threadUpdateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ ...THREAD_ROW, title: 'Новое имя' });

    const result = await updateThread('project_abc', 't1', { title: 'Новое имя' });

    expect(threadUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', deletedAt: null },
      data: { title: 'Новое имя' },
    });
    expect(result?.title).toBe('Новое имя');
  });

  it('returns null when the thread is missing (count 0)', async () => {
    threadUpdateMany.mockResolvedValue({ count: 0 });

    const result = await updateThread('project_abc', 'missing', { title: 'x' });

    expect(result).toBeNull();
  });
});

describe('deleteThread', () => {
  it('soft-deletes by setting deletedAt', async () => {
    await deleteThread('project_abc', 't1');

    expect(threadUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe('forkThread', () => {
  it('creates a fork linked by forkedFromId and copies source messages', async () => {
    findFirst.mockResolvedValue(THREAD_ROW);
    const forkRow = { ...THREAD_ROW, id: 't2', title: 'Главный (копия)', forkedFromId: 't1' };
    threadCreate.mockResolvedValue(forkRow);
    messageFindMany.mockResolvedValue([MESSAGE_ROW]);
    messageCreate.mockResolvedValue({ ...MESSAGE_ROW, id: 'm2' });

    const result = await forkThread('project_abc', 't1');

    expect(threadCreate).toHaveBeenCalledWith({
      data: { title: 'Главный (копия)', forkedFromId: 't1' },
    });
    // Source messages copied with new ids, same content/role, into the fork.
    expect(messageCreate).toHaveBeenCalledWith({
      data: { role: 'USER', content: 'hello', threadId: 't2' },
    });
    expect(result?.thread.id).toBe('t2');
    expect(result?.thread.forkedFromId).toBe('t1');
    expect(result?.messages).toHaveLength(1);
  });

  it('returns null when the source thread does not exist', async () => {
    findFirst.mockResolvedValue(null);

    const result = await forkThread('project_abc', 'missing');

    expect(result).toBeNull();
    expect(threadCreate).not.toHaveBeenCalled();
  });
});
