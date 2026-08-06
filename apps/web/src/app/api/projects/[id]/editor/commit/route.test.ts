import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Thin POST commit route gates: 403/404/400/409/200. Editor barrel fully mocked.
 */

const {
  requireUser,
  gateEditorRequest,
  commitFiles,
  publishSaved,
  mapEditorError,
  gitAuthorFromSession,
} = vi.hoisted(() => ({
  requireUser: vi.fn(),
  gateEditorRequest: vi.fn(),
  commitFiles: vi.fn(),
  publishSaved: vi.fn(),
  mapEditorError: vi.fn(),
  gitAuthorFromSession: vi.fn((user: { name: string | null; email: string }) => ({
    name: user.name?.trim() || 'ann',
    email: user.email,
  })),
}));

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/editor', () => ({
  gateEditorRequest,
  commitFiles,
  publishSaved,
  mapEditorError,
  gitAuthorFromSession,
}));

const { POST } = await import('./route');

const CTX = {
  id: 'p1',
  name: 'Demo',
  schemaName: 'project_x',
  ownerId: 'u1',
  giteaOwner: 'aistudio',
  giteaRepo: 'repo',
  giteaDefaultBranch: 'main',
};

const PRO_USER = {
  id: 'u1',
  email: 'ann@example.com',
  name: 'Ann',
  uiMode: 'PRO' as const,
};

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/projects/p1/editor/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function gateOk(): void {
  requireUser.mockResolvedValue(PRO_USER);
  gateEditorRequest.mockResolvedValue({ ok: true, ctx: CTX });
}

describe('POST commit — auth gates', () => {
  it('answers 403 for BASIC users', async () => {
    requireUser.mockResolvedValue({ ...PRO_USER, uiMode: 'BASIC' });
    gateEditorRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Редактор доступен только в режиме Pro' }, { status: 403 }),
    });

    const response = await POST(makeRequest({ files: [{ path: 'a.ts', content: 'x' }] }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(403);
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('answers 404 when project is inaccessible', async () => {
    requireUser.mockResolvedValue(PRO_USER);
    gateEditorRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Проект не найден' }, { status: 404 }),
    });

    const response = await POST(makeRequest({ files: [{ path: 'a.ts', content: 'x' }] }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(404);
  });
});

describe('POST commit — validation and conflict', () => {
  it('answers 400 when files is empty', async () => {
    gateOk();

    const response = await POST(makeRequest({ files: [] }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
    expect(commitFiles).not.toHaveBeenCalled();
  });

  it('answers 409 on SHA conflict', async () => {
    gateOk();
    const conflict = new Error('SHA conflict');
    commitFiles.mockRejectedValue(conflict);
    mapEditorError.mockReturnValue(
      Response.json({ error: 'Конфликт версий файла' }, { status: 409 }),
    );

    const response = await POST(
      makeRequest({ files: [{ path: 'a.ts', content: 'x', sha: 'stale' }] }),
      { params: Promise.resolve({ id: 'p1' }) },
    );

    expect(response.status).toBe(409);
    expect(mapEditorError).toHaveBeenCalledWith(conflict);
    expect(publishSaved).not.toHaveBeenCalled();
  });
});

describe('POST commit — happy path', () => {
  it('answers 200 and publishes saved', async () => {
    gateOk();
    commitFiles.mockResolvedValue({
      commitSha: 'abc123',
      branch: 'main',
      files: ['README.md'],
    });

    const response = await POST(
      makeRequest({
        message: 'fix typo',
        files: [{ path: 'README.md', content: '# Hi', sha: 'old' }],
      }),
      { params: Promise.resolve({ id: 'p1' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      commitSha: 'abc123',
      branch: 'main',
      files: ['README.md'],
    });
    expect(commitFiles).toHaveBeenCalledWith(
      CTX,
      expect.objectContaining({
        message: 'fix typo',
        files: [{ path: 'README.md', content: '# Hi', sha: 'old' }],
        author: { name: 'Ann', email: 'ann@example.com' },
      }),
    );
    expect(publishSaved).toHaveBeenCalledWith('p1', 'u1', 'abc123', ['README.md']);
  });
});
