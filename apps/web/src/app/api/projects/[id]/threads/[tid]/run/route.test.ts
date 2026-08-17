import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the thin `/threads/{tid}/run` bridge:
 * auth → save USER → Redis subscribe → enqueue chat:run → SSE Response.
 */

const { requireUser, resolveProjectSchema, ensureThreadSchema, saveMessage, queueAdd, subscribe } =
  vi.hoisted(() => ({
    requireUser: vi.fn(),
    resolveProjectSchema: vi.fn(),
    ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
    saveMessage: vi.fn().mockResolvedValue(undefined),
    queueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
    subscribe: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({ saveMessage }));
vi.mock('@aiflow/queue', () => ({
  chatRunChannel: (runId: string) => `chat:run:${runId}`,
  createRedisConnection: () => ({
    subscribe,
    on: vi.fn(),
    off: vi.fn(),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
  }),
  getChatRunQueue: () => ({ add: queueAdd }),
}));

const { POST } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/p1/threads/t1/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /threads/[tid]/run — bridge', () => {
  it('returns 404 when project is missing', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    resolveProjectSchema.mockResolvedValue(null);
    const res = await POST(makeRequest({ messages: [{ content: 'hi' }] }), {
      params: Promise.resolve({ id: 'p1', tid: 't1' }),
    });
    expect(res.status).toBe(404);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('returns 400 for empty message', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    resolveProjectSchema.mockResolvedValue('project_p1');
    const res = await POST(makeRequest({ messages: [{ content: '  ' }] }), {
      params: Promise.resolve({ id: 'p1', tid: 't1' }),
    });
    expect(res.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('saves USER, subscribes, enqueues, returns SSE', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
    resolveProjectSchema.mockResolvedValue('project_p1');
    const res = await POST(makeRequest({ messages: [{ content: 'Привет' }], threadId: 't1' }), {
      params: Promise.resolve({ id: 'p1', tid: 't1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(saveMessage).toHaveBeenCalledWith('project_p1', {
      role: 'USER',
      content: 'Привет',
      threadId: 't1',
    });
    expect(subscribe).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      'chat-run',
      expect.objectContaining({
        projectId: 'p1',
        schemaName: 'project_p1',
        threadId: 't1',
        ownerId: 'u1',
        uiMode: 'PRO',
        userMessage: 'Привет',
      }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
    await res.body?.cancel();
  });
});

describe('POST /threads/[tid]/run — client message id (OQ #10)', () => {
  it('reuses AG-UI client message id as ChatMessage PK', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    resolveProjectSchema.mockResolvedValue('project_p1');
    const clientId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    const res = await POST(
      makeRequest({ messages: [{ id: clientId, content: 'hi' }], threadId: 't1' }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );
    expect(res.status).toBe(200);
    expect(saveMessage).toHaveBeenCalledWith('project_p1', {
      role: 'USER',
      content: 'hi',
      threadId: 't1',
      id: clientId,
    });
    await res.body?.cancel();
  });

  it('ignores non-UUID client message ids', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    resolveProjectSchema.mockResolvedValue('project_p1');
    const res = await POST(
      makeRequest({ messages: [{ id: 'not-a-uuid', content: 'hi' }], threadId: 't1' }),
      { params: Promise.resolve({ id: 'p1', tid: 't1' }) },
    );
    expect(res.status).toBe(200);
    expect(saveMessage).toHaveBeenCalledWith('project_p1', {
      role: 'USER',
      content: 'hi',
      threadId: 't1',
    });
    await res.body?.cancel();
  });
});
