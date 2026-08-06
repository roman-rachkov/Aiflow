import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUser = vi.fn();
const assertProDeploy = vi.fn(() => null);
const resolveDeployContext = vi.fn();
const createDeployment = vi.fn();
const listDeployments = vi.fn();

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({
  resolveProjectSchema: vi.fn().mockResolvedValue('project_aa'),
}));
vi.mock('@/features/deploy', () => ({
  assertProDeploy,
  resolveDeployContext,
  createDeployment,
  listDeployments,
  DeployConflictError: class DeployConflictError extends Error {
    constructor(message = 'Сборка уже выполняется') {
      super(message);
      this.name = 'DeployConflictError';
    }
  },
  DeployGiteaMissingError: class DeployGiteaMissingError extends Error {},
}));
vi.mock('@/shared/gitea', () => ({
  isGiteaUpstreamError: () => false,
}));

const { POST, GET } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
  assertProDeploy.mockReturnValue(null);
});

describe('POST /deployments', () => {
  it('returns 202 and enqueues via createDeployment', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
    resolveDeployContext.mockResolvedValue({
      projectId: 'p1',
      schemaName: 'project_aa',
      giteaOwner: 'o',
      giteaRepo: 'r',
      giteaDefaultBranch: 'main',
    });
    createDeployment.mockResolvedValue({ deploymentId: 'd1', status: 'BUILDING' });

    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ deploymentId: 'd1', status: 'BUILDING' });
  });

  it('returns 409 when createDeployment throws conflict', async () => {
    const { DeployConflictError } = await import('@/features/deploy');
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
    resolveDeployContext.mockResolvedValue({
      projectId: 'p1',
      schemaName: 'project_aa',
      giteaOwner: 'o',
      giteaRepo: 'r',
      giteaDefaultBranch: 'main',
    });
    createDeployment.mockRejectedValue(new DeployConflictError());

    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 403 for BASIC', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    assertProDeploy.mockReturnValue(Response.json({ error: 'x' }, { status: 403 }) as never);

    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: '{}' }), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /deployments', () => {
  it('lists for owner', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    listDeployments.mockResolvedValue([]);
    const res = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(200);
  });
});
