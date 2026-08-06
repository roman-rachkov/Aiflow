import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Thin GET tree route gates: BASIC → 403, no access → 404, happy → 200.
 */

const { requireUser, gateEditorRequest, listTree, mapEditorError } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  gateEditorRequest: vi.fn(),
  listTree: vi.fn(),
  mapEditorError: vi.fn(),
}));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/editor', () => ({
  gateEditorRequest,
  listTree,
  mapEditorError,
}));

const { GET } = await import('./route');

const CTX = {
  id: 'p1',
  name: 'Demo',
  schemaName: 'project_x',
  ownerId: 'u1',
  giteaOwner: 'aistudio',
  giteaRepo: 'repo',
  giteaDefaultBranch: 'main',
};

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(query = ''): Request {
  return new Request(`http://localhost/api/projects/p1/editor/tree${query}`, {
    method: 'GET',
  });
}

describe('GET /api/projects/[id]/editor/tree', () => {
  it('answers 403 when gate returns BASIC forbidden', async () => {
    requireUser.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ann',
      uiMode: 'BASIC',
    });
    gateEditorRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Редактор доступен только в режиме Pro' }, { status: 403 }),
    });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(403);
    expect(listTree).not.toHaveBeenCalled();
  });

  it('answers 404 when resolve yields no access (soft-delete / foreign)', async () => {
    requireUser.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ann',
      uiMode: 'PRO',
    });
    gateEditorRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Проект не найден' }, { status: 404 }),
    });

    const response = await GET(makeRequest(), { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(404);
    expect(listTree).not.toHaveBeenCalled();
  });

  it('answers 200 with tree nodes on happy path', async () => {
    requireUser.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ann',
      uiMode: 'PRO',
    });
    gateEditorRequest.mockResolvedValue({ ok: true, ctx: CTX });
    listTree.mockResolvedValue([{ path: 'README.md', name: 'README.md', type: 'file', size: 10 }]);

    const response = await GET(makeRequest('?ref=main'), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);
    expect(listTree).toHaveBeenCalledWith(CTX, { ref: 'main', path: undefined });
    await expect(response.json()).resolves.toEqual([
      { path: 'README.md', name: 'README.md', type: 'file', size: 10 },
    ]);
  });
});
