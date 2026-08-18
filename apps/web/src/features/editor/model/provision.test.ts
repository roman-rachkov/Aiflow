import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Lazy Gitea provision: null ProjectMeta gitea* fields backfill once; already
 * filled identity skips createRepo; soft-deleted / foreign → null context.
 */

const findUnique = vi.fn();
const updateMany = vi.fn();
const createRepo = vi.fn();
const deleteRepo = vi.fn();
const getAuthenticatedUser = vi.fn();
const seedUserTemplate = vi.fn();

vi.mock('@aiflow/db', () => ({
  getPublicClient: () => ({
    projectMeta: { findUnique, updateMany },
  }),
}));

vi.mock('@/shared/gitea', () => ({
  createRepo,
  deleteRepo,
  getAuthenticatedUser,
  seedUserTemplate,
}));

const { ensureGiteaProvisioned, giteaRepoNameFromProjectId } = await import('./provision');
const { resolveEditorContext } = await import('./access');

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';
const REPO = giteaRepoNameFromProjectId(PROJECT_ID);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.GITEA_REPO_OWNER;
});

function stubCreateHappy(): void {
  process.env.GITEA_REPO_OWNER = 'aistudio';
  createRepo.mockResolvedValue({
    id: 1,
    name: REPO,
    fullName: `aistudio/${REPO}`,
    private: true,
    defaultBranch: 'main',
    owner: 'aistudio',
  });
  seedUserTemplate.mockResolvedValue(8);
}

describe('ensureGiteaProvisioned — backfill', () => {
  it('creates repo and backfills null gitea fields once', async () => {
    stubCreateHappy();
    findUnique
      .mockResolvedValueOnce({
        giteaOwner: null,
        giteaRepo: null,
        giteaDefaultBranch: 'main',
      })
      .mockResolvedValue({
        giteaOwner: 'aistudio',
        giteaRepo: REPO,
        giteaDefaultBranch: 'main',
      });
    updateMany.mockResolvedValue({ count: 1 });

    const identity = await ensureGiteaProvisioned(PROJECT_ID, 'Demo');

    expect(identity).toEqual({
      owner: 'aistudio',
      repo: REPO,
      defaultBranch: 'main',
    });
    expect(createRepo).toHaveBeenCalledTimes(1);
    expect(createRepo).toHaveBeenCalledWith(
      expect.objectContaining({ name: REPO, private: true, defaultBranch: 'main' }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: PROJECT_ID,
        deletedAt: null,
        giteaOwner: null,
        giteaRepo: null,
      },
      data: {
        giteaOwner: 'aistudio',
        giteaRepo: REPO,
        giteaDefaultBranch: 'main',
      },
    });
  });
});

describe('ensureGiteaProvisioned — already filled', () => {
  it('skips createRepo when gitea fields are already set', async () => {
    findUnique.mockResolvedValue({
      giteaOwner: 'aistudio',
      giteaRepo: REPO,
      giteaDefaultBranch: 'main',
    });

    const identity = await ensureGiteaProvisioned(PROJECT_ID, 'Demo');

    expect(identity.repo).toBe(REPO);
    expect(createRepo).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('resolveEditorContext — soft-delete / ownership', () => {
  it('returns null for soft-deleted or missing project', async () => {
    findUnique.mockResolvedValue(null);

    await expect(resolveEditorContext(PROJECT_ID, 'u1')).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, deletedAt: null },
      select: expect.objectContaining({
        giteaOwner: true,
        giteaRepo: true,
      }),
    });
    expect(createRepo).not.toHaveBeenCalled();
  });

  it('returns null when owner does not match', async () => {
    findUnique.mockResolvedValue({
      id: PROJECT_ID,
      name: 'Demo',
      schemaName: 'project_x',
      ownerId: 'other',
      giteaOwner: 'aistudio',
      giteaRepo: REPO,
      giteaDefaultBranch: 'main',
    });

    await expect(resolveEditorContext(PROJECT_ID, 'u1')).resolves.toBeNull();
  });
});

describe('resolveEditorContext — lazy provision', () => {
  it('lazy-provisions when owned project has null gitea fields', async () => {
    stubCreateHappy();
    findUnique
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        name: 'Demo',
        schemaName: 'project_x',
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
    updateMany.mockResolvedValue({ count: 1 });

    const ctx = await resolveEditorContext(PROJECT_ID, 'u1');

    expect(ctx).toMatchObject({
      id: PROJECT_ID,
      ownerId: 'u1',
      giteaOwner: 'aistudio',
      giteaRepo: REPO,
      giteaDefaultBranch: 'main',
    });
    expect(createRepo).toHaveBeenCalledTimes(1);
  });
});
