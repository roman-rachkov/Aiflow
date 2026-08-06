import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const queueAdd = vi.fn();
const exportDeployTemplates = vi.fn();
const findFirst = vi.fn();
const deploymentCreate = vi.fn();
const deploymentUpdate = vi.fn();
const metaCreate = vi.fn();
const metaUpdate = vi.fn();

vi.mock('@aiflow/queue', () => ({
  getDeployQueue: () => ({ add: queueAdd }),
}));

vi.mock('./export', () => ({
  exportDeployTemplates,
}));

vi.mock('@aiflow/db', () => ({
  getProjectClient: () => ({
    deployment: { findFirst, create: deploymentCreate, update: deploymentUpdate },
  }),
  getPublicClient: () => ({
    deploymentMeta: { create: metaCreate, update: metaUpdate },
  }),
}));

const { createDeployment } = await import('./service');
const { DeployConflictError } = await import('./types');

const CTX = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  giteaOwner: 'aistudio',
  giteaRepo: 'proj-1',
  giteaDefaultBranch: 'main',
};

type CreateArg = { data: { id: string } };

beforeEach(() => {
  findFirst.mockResolvedValue(null);
  exportDeployTemplates.mockResolvedValue({
    dockerfile: 'FROM node',
    compose: 'services: {}',
    imageName: 'aistudio-project-proj',
    committed: true,
    commitSha: 'abc',
  });
  deploymentCreate.mockImplementation((arg: CreateArg) => Promise.resolve(arg.data));
  metaCreate.mockImplementation((arg: CreateArg) => Promise.resolve(arg.data));
  queueAdd.mockResolvedValue({ id: 'job-1' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('createDeployment', () => {
  it('enqueues deploy:run with matching Deployment/Meta ids', async () => {
    const result = await createDeployment(CTX);

    expect(exportDeployTemplates).toHaveBeenCalled();
    expect(deploymentCreate).toHaveBeenCalled();
    expect(metaCreate).toHaveBeenCalled();

    const depId = (deploymentCreate.mock.calls[0][0] as CreateArg).data.id;
    const metaId = (metaCreate.mock.calls[0][0] as CreateArg).data.id;
    expect(depId).toBe(metaId);
    expect(result.deploymentId).toBe(depId);
    expect(result.status).toBe('BUILDING');

    expect(queueAdd).toHaveBeenCalledWith(
      'deploy:run',
      expect.objectContaining({
        projectId: CTX.projectId,
        deploymentId: depId,
        schemaName: CTX.schemaName,
        giteaOwner: CTX.giteaOwner,
        giteaRepo: CTX.giteaRepo,
        giteaDefaultBranch: CTX.giteaDefaultBranch,
      }),
      expect.objectContaining({ jobId: depId }),
    );
  });

  it('throws 409 conflict when BUILDING exists', async () => {
    findFirst.mockResolvedValue({ id: 'busy' });
    await expect(createDeployment(CTX)).rejects.toBeInstanceOf(DeployConflictError);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('apps/web has no dockerode', () => {
  it('package.json does not list dockerode', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const webPkgPath = join(here, '../../../../package.json');
    const webPkg = JSON.parse(readFileSync(webPkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(webPkg.dependencies?.dockerode).toBeUndefined();
  });
});
