import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EditorContext } from './types';

/**
 * Mocked primary-path smoke for Task 2.2 Pro editor (no Playwright).
 *
 * Walks: resolveEditorContext (lazy provision) → listTree → getFileContent →
 * commitFiles → listCommits → getDiff, then publishSaved → hub fan-out.
 *
 * Compose checklist (human / docker compose up):
 * 1. Pro user creates a project → Gitea private repo exists with README.
 * 2. Open `/projects/[id]/editor` → tree loads.
 * 3. Edit README → Save → commit appears in the Git panel.
 * Automated bar: this file + `yarn verify`.
 */

const {
  findUnique,
  updateMany,
  getTree,
  getFile,
  createOrUpdateFile,
  createRepo,
  deleteRepo,
  seedUserTemplate,
  getAuthenticatedUser,
  listGiteaCommits,
  getCommitDiff,
} = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  getTree: vi.fn(),
  getFile: vi.fn(),
  createOrUpdateFile: vi.fn(),
  createRepo: vi.fn(),
  deleteRepo: vi.fn(),
  seedUserTemplate: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  listGiteaCommits: vi.fn(),
  getCommitDiff: vi.fn(),
}));

vi.mock('@aiflow/db', () => ({
  getPublicClient: () => ({
    projectMeta: { findUnique, updateMany },
  }),
}));

vi.mock('@/shared/gitea', async () => {
  const errors = await import('../../../shared/gitea/errors');
  return {
    getTree,
    getFile,
    createOrUpdateFile,
    createRepo,
    deleteRepo,
    seedUserTemplate,
    getAuthenticatedUser,
    listCommits: listGiteaCommits,
    getCommitDiff,
    GiteaUpstreamError: errors.GiteaUpstreamError,
    isGiteaUpstreamError: errors.isGiteaUpstreamError,
  };
});

const { resolveEditorContext } = await import('./access');
const { listTree, getFileContent, commitFiles, listCommits, getDiff } = await import('./service');
const { publishSaved } = await import('./ws-publish');
const { registerEditorSocket, unregisterEditorSocket } = await import('./ws-hub');
const { giteaRepoNameFromProjectId } = await import('./provision');

const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const REPO = giteaRepoNameFromProjectId(PROJECT_ID);
const AUTHOR = { name: 'Ann', email: 'ann@example.com' };

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GITEA_REPO_OWNER;
});

async function arrangeLazyProvision(): Promise<EditorContext> {
  process.env.GITEA_REPO_OWNER = 'aistudio';
  findUnique
    .mockResolvedValueOnce({
      id: PROJECT_ID,
      name: 'Smoke',
      schemaName: 'project_smoke',
      ownerId: 'u1',
      giteaOwner: null,
      giteaRepo: null,
      giteaDefaultBranch: 'main',
    })
    .mockResolvedValueOnce({
      giteaOwner: null,
      giteaRepo: null,
      giteaDefaultBranch: 'main',
    });
  createRepo.mockResolvedValue({
    id: 1,
    name: REPO,
    fullName: `aistudio/${REPO}`,
    private: true,
    defaultBranch: 'main',
    owner: 'aistudio',
  });
  seedUserTemplate.mockResolvedValue(8);
  deleteRepo.mockResolvedValue(undefined);
  createOrUpdateFile.mockResolvedValue({
    path: 'README.md',
    content: '# Smoke\n',
    encoding: 'utf-8',
    sha: 'readme1',
    size: 8,
    commitSha: 'initsha',
  });
  updateMany.mockResolvedValue({ count: 1 });
  const ctx = await resolveEditorContext(PROJECT_ID, 'u1');
  if (!ctx) throw new Error('expected editor context');
  return ctx;
}

async function walkReadWrite(ctx: EditorContext): Promise<string> {
  getTree.mockResolvedValue([
    { path: 'README.md', mode: '100644', type: 'blob', sha: 'readme1', size: 8 },
  ]);
  expect(await listTree(ctx)).toEqual([
    { path: 'README.md', name: 'README.md', type: 'file', size: 8 },
  ]);

  getFile.mockResolvedValue({
    path: 'README.md',
    content: '# Smoke\n',
    encoding: 'utf-8',
    sha: 'readme1',
    size: 8,
  });
  expect((await getFileContent(ctx, 'README.md')).content).toContain('Smoke');

  createOrUpdateFile.mockResolvedValue({
    path: 'README.md',
    content: '# Smoke\n\nedited\n',
    encoding: 'utf-8',
    sha: 'readme2',
    size: 16,
    commitSha: 'savesha',
  });
  const saved = await commitFiles(ctx, {
    files: [{ path: 'README.md', content: '# Smoke\n\nedited\n', sha: 'readme1' }],
    author: AUTHOR,
  });
  expect(saved.commitSha).toBe('savesha');
  return saved.commitSha;
}

async function walkHistoryDiff(ctx: EditorContext): Promise<void> {
  listGiteaCommits.mockResolvedValue([
    {
      sha: 'savesha0123456789',
      message: 'Update README.md via AI Studio',
      url: 'http://gitea/c',
      author: { name: 'Ann', email: 'ann@example.com', date: '2026-08-07T00:00:00Z' },
      committer: { name: 'Ann', email: 'ann@example.com', date: '2026-08-07T00:00:00Z' },
      created: '2026-08-07T00:00:00Z',
    },
  ]);
  expect((await listCommits(ctx))[0]?.shortSha).toBe('savesha');

  getCommitDiff.mockResolvedValue({
    sha: 'savesha0123456789',
    message: 'Update README.md via AI Studio',
    files: [
      {
        filename: 'README.md',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: '@@ -1 +1,3 @@\n',
      },
    ],
  });
  const diff = await getDiff(ctx, { sha: 'savesha0123456789' });
  expect(diff.files[0]?.path).toBe('README.md');
}

function assertWsPublish(commitSha: string): void {
  const sent: string[] = [];
  const socket = { readyState: 1, send: (data: string) => sent.push(data) };
  registerEditorSocket(PROJECT_ID, 'u1', socket);
  try {
    publishSaved(PROJECT_ID, 'u1', commitSha, ['README.md']);
    expect(sent).toContainEqual(
      JSON.stringify({ type: 'editor.saved', path: 'README.md', commitSha }),
    );
    expect(sent).toContainEqual(JSON.stringify({ type: 'editor.treeChanged' }));
  } finally {
    unregisterEditorSocket(PROJECT_ID, 'u1', socket);
  }
}

describe('Pro editor primary path (mocked smoke)', () => {
  it('lazy-provisions, reads, commits, lists history/diff, and publishes WS', async () => {
    const ctx = await arrangeLazyProvision();
    expect(ctx.giteaRepo).toBe(REPO);
    expect(createRepo).toHaveBeenCalledTimes(1);

    const commitSha = await walkReadWrite(ctx);
    await walkHistoryDiff(ctx);
    assertWsPublish(commitSha);
  });
});
