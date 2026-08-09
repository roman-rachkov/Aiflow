import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the per-message mutation route (PATCH edit / DELETE) that
 * backs the in-chat edit and delete actions. Auth, schema resolve, and the
 * thread backfill are mocked; the chat service is mocked to assert call shapes.
 */

const {
  requireUser,
  resolveProjectSchema,
  ensureThreadSchema,
  updateMessageContent,
  deleteMessage,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  resolveProjectSchema: vi.fn(),
  ensureThreadSchema: vi.fn().mockResolvedValue(undefined),
  updateMessageContent: vi.fn(),
  deleteMessage: vi.fn(),
}));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@aiflow/db', () => ({ ensureThreadSchema }));
vi.mock('@/features/chat', () => ({ updateMessageContent, deleteMessage }));

const { PATCH, DELETE } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
});

function mockResolve(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
}

function ctx() {
  return { params: Promise.resolve({ id: 'p1', tid: 't1', mid: 'm1' }) };
}

describe('PATCH /threads/{tid}/messages/{mid} — edit', () => {
  it('persists the new content and answers 200', async () => {
    mockResolve();
    updateMessageContent.mockResolvedValue({
      id: 'm1',
      role: 'USER',
      content: 'edited',
      threadId: 't1',
      parentId: null,
      createdAt: new Date('2026-01-01'),
    });

    const response = await PATCH(
      new Request('http://localhost/api/projects/p1/threads/t1/messages/m1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'edited' }),
      }),
      ctx(),
    );

    expect(response.status).toBe(200);
    expect(updateMessageContent).toHaveBeenCalledWith('project_x', 'm1', 'edited');
  });

  it('answers 400 on empty content', async () => {
    mockResolve();

    const response = await PATCH(
      new Request('http://localhost/api/projects/p1/threads/t1/messages/m1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '   ' }),
      }),
      ctx(),
    );

    expect(response.status).toBe(400);
    expect(updateMessageContent).not.toHaveBeenCalled();
  });

  it('answers 404 when the message is missing', async () => {
    mockResolve();
    updateMessageContent.mockResolvedValue(null);

    const response = await PATCH(
      new Request('http://localhost/api/projects/p1/threads/t1/messages/m1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'x' }),
      }),
      ctx(),
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /threads/{tid}/messages/{mid} — soft-delete', () => {
  it('soft-deletes the message and answers 204', async () => {
    mockResolve();
    deleteMessage.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request('http://localhost/api/projects/p1/threads/t1/messages/m1', { method: 'DELETE' }),
      ctx(),
    );

    expect(response.status).toBe(204);
    expect(deleteMessage).toHaveBeenCalledWith('project_x', 'm1');
  });
});
