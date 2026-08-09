import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the per-thread REST route (get messages / rename / delete)
 * consumed by the OpenUI `restStorage` client. `@/features/chat` is mocked as a
 * whole (see threads/route.test.ts for the alias rationale); the AG-UI message
 * mapper is re-implemented inline.
 */

const {
  requireUser,
  resolveProjectSchema,
  ensureThreadSchema,
  getThread,
  listMessagesByThread,
  updateThread,
  deleteThread,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  getThread: vi.fn(),
  listMessagesByThread: vi.fn(),
  updateThread: vi.fn(),
  deleteThread: vi.fn(),
}));

function toAguiMessages(
  rows: Array<{ id: string; role: string; content: string }>,
): Array<{ id: string; role: string; content: string }> {
  return rows.map((r) => ({
    id: r.id,
    role: r.role === 'SYSTEM' ? 'system' : r.role.toLowerCase(),
    content: r.content,
  }));
}

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({
  deleteThread,
  getThread,
  listMessagesByThread,
  updateThread,
  toAguiMessages,
}));

const { GET, PATCH, DELETE } = await import('./route');

const NOW = new Date('2026-01-01T00:00:00Z');

afterEach(() => {
  vi.clearAllMocks();
});

function mockResolve(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
}

function ctx() {
  return { params: Promise.resolve({ id: 'p1', tid: 't1' }) };
}

describe('GET /threads/{tid} — messages', () => {
  it('returns AG-UI wire messages of the thread', async () => {
    mockResolve();
    getThread.mockResolvedValue({ id: 't1', title: 'Главный' });
    listMessagesByThread.mockResolvedValue([
      { id: 'm1', role: 'USER', content: 'hi', threadId: 't1', parentId: null, createdAt: NOW },
      {
        id: 'm2',
        role: 'ASSISTANT',
        content: 'hello',
        threadId: 't1',
        parentId: null,
        createdAt: NOW,
      },
    ]);

    const response = await GET(new Request('http://localhost/api/projects/p1/threads/t1'), ctx());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual([
      { id: 'm1', role: 'user', content: 'hi' },
      { id: 'm2', role: 'assistant', content: 'hello' },
    ]);
  });

  it('answers 404 when the thread is missing', async () => {
    mockResolve();
    getThread.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/projects/p1/threads/t1'), ctx());

    expect(response.status).toBe(404);
  });
});

describe('PATCH /threads/{tid} — rename', () => {
  it('updates the title and returns the thread', async () => {
    mockResolve();
    updateThread.mockResolvedValue({
      id: 't1',
      title: 'Новое имя',
      forkedFromId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const response = await PATCH(
      new Request('http://localhost/api/projects/p1/threads/t1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Новое имя' }),
      }),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(updateThread).toHaveBeenCalledWith('project_x', 't1', { title: 'Новое имя' });
  });

  it('answers 404 when the thread is missing', async () => {
    mockResolve();
    updateThread.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/projects/p1/threads/t1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x' }),
      }),
      ctx(),
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /threads/{tid} — soft-delete', () => {
  it('soft-deletes the thread and answers 204', async () => {
    mockResolve();
    deleteThread.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request('http://localhost/api/projects/p1/threads/t1', { method: 'DELETE' }),
      ctx(),
    );

    expect(response.status).toBe(204);
    expect(deleteThread).toHaveBeenCalledWith('project_x', 't1');
  });
});
