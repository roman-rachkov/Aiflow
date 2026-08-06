import { afterEach, describe, expect, it, vi } from 'vitest';

import { GiteaUpstreamError, isGiteaUpstreamError } from '../../../shared/gitea/errors';

import type { EditorContext } from './types';

/**
 * Editor domain services: tree sort, commit message template, conflict map,
 * directory `.gitkeep`, and binary → BinaryFileError. Gitea is fully mocked.
 */

const { getTree, getFile, createOrUpdateFile, deleteFile, listGiteaCommits, getCommitDiff } =
  vi.hoisted(() => ({
    getTree: vi.fn(),
    getFile: vi.fn(),
    createOrUpdateFile: vi.fn(),
    deleteFile: vi.fn(),
    listGiteaCommits: vi.fn(),
    getCommitDiff: vi.fn(),
  }));

vi.mock('@/shared/gitea', async () => {
  const errors = await import('../../../shared/gitea/errors');
  return {
    getTree,
    getFile,
    createOrUpdateFile,
    deleteFile,
    listCommits: listGiteaCommits,
    getCommitDiff,
    GiteaUpstreamError: errors.GiteaUpstreamError,
    isGiteaUpstreamError: errors.isGiteaUpstreamError,
  };
});

const {
  listTree,
  getFileContent,
  commitFiles,
  createPath,
  BinaryFileError,
  ConflictError,
  isBinaryFileError,
  isConflictError,
} = await import('./service');

const CTX: EditorContext = {
  id: 'p1',
  name: 'Demo',
  schemaName: 'project_p1',
  ownerId: 'u1',
  giteaOwner: 'aistudio',
  giteaRepo: 'project_abc',
  giteaDefaultBranch: 'main',
};

const AUTHOR = { name: 'Ann', email: 'ann@example.com' };

afterEach(() => {
  vi.clearAllMocks();
});

describe('listTree', () => {
  it('returns dirs then files, each group sorted by name', async () => {
    getTree.mockResolvedValue([
      { path: 'z.txt', mode: '100644', type: 'blob', sha: '1', size: 1 },
      { path: 'src', mode: '040000', type: 'tree', sha: '2' },
      { path: 'a.txt', mode: '100644', type: 'blob', sha: '3', size: 2 },
      { path: 'lib', mode: '040000', type: 'tree', sha: '4' },
      { path: 'src/nested.ts', mode: '100644', type: 'blob', sha: '5', size: 3 },
    ]);

    const nodes = await listTree(CTX);
    expect(nodes.map((n) => `${n.type}:${n.name}`)).toEqual([
      'dir:lib',
      'dir:src',
      'file:a.txt',
      'file:z.txt',
    ]);
  });
});

describe('getFileContent', () => {
  it('throws BinaryFileError when content looks binary', async () => {
    getFile.mockResolvedValue({
      path: 'a.bin',
      content: 'hello\0world',
      encoding: 'utf-8',
      sha: 's1',
      size: 11,
    });

    await expect(getFileContent(CTX, 'a.bin')).rejects.toSatisfy(
      (err: unknown) => isBinaryFileError(err) && err instanceof BinaryFileError,
    );
  });
});

describe('commitFiles', () => {
  it('uses Update {paths} via AI Studio when message is empty', async () => {
    createOrUpdateFile.mockResolvedValue({
      path: 'a.ts',
      content: 'x',
      encoding: 'utf-8',
      sha: 'n1',
      size: 1,
      commitSha: 'c1',
    });

    const result = await commitFiles(CTX, {
      files: [{ path: 'a.ts', content: 'x', sha: 'old' }],
      author: AUTHOR,
    });

    expect(result).toEqual({ commitSha: 'c1', branch: 'main', files: ['a.ts'] });
    expect(createOrUpdateFile).toHaveBeenCalledWith(
      'aistudio',
      'project_abc',
      'a.ts',
      expect.objectContaining({
        message: 'Update a.ts via AI Studio',
        author: AUTHOR,
        committer: AUTHOR,
      }),
    );
  });

  it('maps Gitea 409 to ConflictError', async () => {
    expect(isGiteaUpstreamError(new GiteaUpstreamError('x', 409))).toBe(true);
    createOrUpdateFile.mockRejectedValue(new GiteaUpstreamError('conflict', 409, ''));

    await expect(
      commitFiles(CTX, {
        files: [{ path: 'a.ts', content: 'x', sha: 'stale' }],
        author: AUTHOR,
      }),
    ).rejects.toSatisfy((err: unknown) => isConflictError(err) && err instanceof ConflictError);
  });
});

describe('createPath', () => {
  it('materialises directories as .gitkeep', async () => {
    createOrUpdateFile.mockResolvedValue({
      path: 'docs/.gitkeep',
      content: '',
      encoding: 'utf-8',
      sha: 'k1',
      size: 0,
      commitSha: 'c2',
    });

    const result = await createPath(CTX, {
      path: 'docs',
      isDir: true,
      author: AUTHOR,
    });

    expect(result.path).toBe('docs/.gitkeep');
    expect(createOrUpdateFile).toHaveBeenCalledWith(
      'aistudio',
      'project_abc',
      'docs/.gitkeep',
      expect.objectContaining({ content: '' }),
    );
  });
});
