import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the thread fork route (POST /threads/{tid}/fork). Auth, schema
 * resolve, and the thread backfill are mocked; `forkThread` + `toAguiThread`
 * are mocked to assert call shapes and the wire response.
 */

const { requireUser, resolveProjectSchema, ensureThreadSchema, forkThread } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  forkThread: vi.fn(),
}));

/** Inline toAguiThread so the route runs against a real mapper (it is trivial). */
function toAguiThread(t: { id: string; title: string; createdAt: Date }) {
  return { id: t.id, title: t.title, createdAt: t.createdAt.toISOString() };
}

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({ forkThread, toAguiThread }));

const { POST } = await import('./route');

const NOW = new Date('2026-01-01T00:00:00Z');

afterEach(() => {
  vi.clearAllMocks();
});

function ctx() {
  return { params: Promise.resolve({ id: 'p1', tid: 't1' }) };
}

function postRequest(body?: unknown): Request {
  return new Request('http://localhost/api/projects/p1/threads/t1/fork', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

describe('POST /threads/{tid}/fork — fork', () => {
  it('creates a fork and returns the new thread as AG-UI wire', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue('project_x');
    forkThread.mockResolvedValue({
      thread: {
        id: 't2',
        title: 'Главный (копия)',
        forkedFromId: 't1',
        createdAt: NOW,
        updatedAt: NOW,
      },
      messages: [],
    });

    const response = await POST(postRequest(), ctx());

    expect(response.status).toBe(201);
    expect(forkThread).toHaveBeenCalledWith('project_x', 't1', undefined);
    const json = await response.json();
    expect(json).toEqual({ id: 't2', title: 'Главный (копия)', createdAt: NOW.toISOString() });
  });

  it('passes a custom title when provided', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue('project_x');
    forkThread.mockResolvedValue({
      thread: { id: 't2', title: 'Моя ветка', forkedFromId: 't1', createdAt: NOW, updatedAt: NOW },
      messages: [],
    });

    await POST(postRequest({ title: 'Моя ветка' }), ctx());

    expect(forkThread).toHaveBeenCalledWith('project_x', 't1', 'Моя ветка');
  });

  it('answers 404 when the source thread is missing', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue('project_x');
    forkThread.mockResolvedValue(null);

    const response = await POST(postRequest(), ctx());

    expect(response.status).toBe(404);
  });

  it('answers 404 when the project is inaccessible', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);

    const response = await POST(postRequest(), ctx());

    expect(response.status).toBe(404);
    expect(forkThread).not.toHaveBeenCalled();
  });
});
