import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the thread storage REST route (list + create) consumed by the
 * OpenUI `restStorage({ baseUrl })` client.
 *
 * `@/*` is resolved by tsconfig, not by Vitest (no alias plugin), so the barrel
 * `@/features/chat` must be mocked as a whole here — the route imports both
 * service functions and the pure AG-UI mappers from it. The mappers are
 * re-implemented inline (they are trivial) so tests assert on real behaviour.
 */

const {
  requireUser,
  resolveProjectSchema,
  ensureThreadSchema,
  listThreads,
  createThread,
  createThreadWithMessage,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  listThreads: vi.fn(),
  createThread: vi.fn(),
  createThreadWithMessage: vi.fn(),
}));

/** Inline AG-UI mappers — mirror agui-mappers.ts so the route runs for real. */
function toAguiThread(t: { id: string; title: string; createdAt: Date }): {
  id: string;
  title: string;
  createdAt: string;
} {
  return { id: t.id, title: t.title, createdAt: t.createdAt.toISOString() };
}
function aguiMessageText(m: { content?: unknown }): string {
  return typeof m.content === 'string' ? m.content : '';
}

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({
  createThread,
  createThreadWithMessage,
  listThreads,
  toAguiThread,
  aguiMessageText,
}));

const { GET, POST } = await import('./route');

const NOW = new Date('2026-01-01T00:00:00Z');

afterEach(() => {
  vi.clearAllMocks();
});

function mockResolve(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
}

describe('GET /threads — list', () => {
  it('returns the OpenUI wire shape { threads, nextCursor }', async () => {
    mockResolve();
    listThreads.mockResolvedValue([
      { id: 't1', title: 'Главный', forkedFromId: null, createdAt: NOW, updatedAt: NOW },
    ]);

    const response = await GET(new Request('http://localhost/api/projects/p1/threads'), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({
      threads: [{ id: 't1', title: 'Главный', createdAt: NOW.toISOString() }],
      nextCursor: null,
    });
  });

  it('runs the thread backfill before listing (idempotent)', async () => {
    mockResolve();
    listThreads.mockResolvedValue([]);

    await GET(new Request('http://localhost/api/projects/p1/threads'), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(ensureThreadSchema).toHaveBeenCalledWith('project_x');
  });

  it('answers 404 when the project is inaccessible', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);

    const response = await GET(new Request('http://localhost/api/projects/p1/threads'), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('POST /threads — create', () => {
  function postRequest(body: unknown): Request {
    return new Request('http://localhost/api/projects/p1/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function ctx() {
    return { params: Promise.resolve({ id: 'p1' }) };
  }

  it('creates a thread titled from the first message text (without persisting the message)', async () => {
    mockResolve();
    createThread.mockResolvedValue({
      id: 't2',
      title: 'Хочу блог',
      forkedFromId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const response = await POST(
      postRequest({ messages: [{ id: 'm0', role: 'user', content: 'Хочу блог' }] }),
      ctx(),
    );

    expect(response.status).toBe(201);
    // createThread derives the title from the message; the message itself is
    // persisted later by the /run endpoint (no duplicate USER row).
    expect(createThread).toHaveBeenCalledWith('project_x', { title: 'Хочу блог' });
    expect(createThreadWithMessage).not.toHaveBeenCalled();
    const json = (await response.json()) as { title: string };
    expect(json.title).toBe('Хочу блог');
  });

  it('creates an empty titled thread when no message text is present', async () => {
    mockResolve();
    createThread.mockResolvedValue({
      id: 't3',
      title: 'Моя идея',
      forkedFromId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const response = await POST(postRequest({ title: '  Моя идея  ' }), ctx());

    expect(response.status).toBe(201);
    expect(createThread).toHaveBeenCalledWith('project_x', { title: 'Моя идея' });
    expect(createThreadWithMessage).not.toHaveBeenCalled();
  });
});
