import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDeployUrl, containerName, runDeployedContainer, shortHex } from './run-container';

const DEPLOYMENT_ID = 'dep1dep1-0000-0000-0000-dep1dep1dep1';
const IMAGE_TAG = 'aistudio/demo:20260807020000';
const PROJECT_SCHEMA = 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DB_URL = 'postgresql://ai:ai@postgres:5432/ai_studio?schema=public';

function makeRunningContainer() {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockRemove = vi.fn().mockResolvedValue(undefined);
  const mockStop = vi.fn().mockResolvedValue(undefined);
  const mockInspect = vi.fn().mockResolvedValue({ State: { Running: true } });
  const mockGetContainer = vi
    .fn()
    .mockReturnValue({ inspect: mockInspect, stop: mockStop, remove: mockRemove });
  const mockCreate = vi.fn().mockResolvedValue({ start: mockStart });
  const mockDocker = { createContainer: mockCreate, getContainer: mockGetContainer } as never;
  return { mockStart, mockRemove, mockStop, mockCreate, mockGetContainer, mockDocker };
}

function makeAbsentContainer() {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockCreate = vi.fn().mockResolvedValue({ start: mockStart });
  const mockGetContainer = vi.fn().mockReturnValue({
    inspect: vi.fn().mockRejectedValue(new Error('No such container')),
  });
  const mockDocker = { createContainer: mockCreate, getContainer: mockGetContainer } as never;
  return { mockStart, mockCreate, mockDocker };
}

describe('shortHex', () => {
  it('strips dashes and takes first 8 chars', () => {
    expect(shortHex(DEPLOYMENT_ID)).toBe('dep1dep1');
  });
});

describe('containerName', () => {
  it('prefixes aistudio-dep-', () => {
    expect(containerName(DEPLOYMENT_ID)).toBe('aistudio-dep-dep1dep1');
  });
});

describe('buildDeployUrl', () => {
  beforeEach(() => {
    delete process.env.DEPLOY_PUBLIC_BASE;
  });

  it('defaults to localhost:8090 subdomain', () => {
    const url = buildDeployUrl(DEPLOYMENT_ID);
    expect(url).toMatch(/app-dep1dep1\.localhost/);
    expect(url).toContain('8090');
  });

  it('respects DEPLOY_PUBLIC_BASE', () => {
    process.env.DEPLOY_PUBLIC_BASE = 'http://staging.example.com:8090';
    expect(buildDeployUrl(DEPLOYMENT_ID)).toContain('app-dep1dep1.staging.example.com');
    delete process.env.DEPLOY_PUBLIC_BASE;
  });
});

describe('runDeployedContainer — disabled', () => {
  it('returns docker:// fallback when DEPLOY_DOMAIN_ENABLED is not true', async () => {
    process.env.DEPLOY_DOMAIN_ENABLED = 'false';
    process.env.DATABASE_URL = DB_URL;
    const result = await runDeployedContainer({
      deploymentId: DEPLOYMENT_ID,
      imageTag: IMAGE_TAG,
      projectSchema: PROJECT_SCHEMA,
    });
    expect(result.url).toBe(`docker://${IMAGE_TAG}`);
    expect(result.containerName).toBe('aistudio-dep-dep1dep1');
    delete process.env.DEPLOY_DOMAIN_ENABLED;
  });
});

describe('runDeployedContainer — enabled', () => {
  beforeEach(() => {
    process.env.DEPLOY_DOMAIN_ENABLED = 'true';
    process.env.DATABASE_URL = DB_URL;
  });
  afterEach(() => {
    delete process.env.DEPLOY_DOMAIN_ENABLED;
  });

  it('stops, removes existing container and creates a new one', async () => {
    const { mockStop, mockRemove, mockCreate, mockStart, mockDocker } = makeRunningContainer();
    const result = await runDeployedContainer({
      docker: mockDocker,
      deploymentId: DEPLOYMENT_ID,
      imageTag: IMAGE_TAG,
      projectSchema: PROJECT_SCHEMA,
      traefikNetwork: 'internal',
    });
    expect(mockStop).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'aistudio-dep-dep1dep1',
        Image: IMAGE_TAG,
        Labels: expect.objectContaining({ 'traefik.enable': 'true' }),
        HostConfig: { NetworkMode: 'internal' },
      }),
    );
    expect(mockStart).toHaveBeenCalled();
    expect(result.containerName).toBe('aistudio-dep-dep1dep1');
    expect(result.url).toContain('app-dep1dep1');
  });

  it('proceeds without error when container did not exist', async () => {
    const { mockCreate, mockStart, mockDocker } = makeAbsentContainer();
    const result = await runDeployedContainer({
      docker: mockDocker,
      deploymentId: DEPLOYMENT_ID,
      imageTag: IMAGE_TAG,
      projectSchema: PROJECT_SCHEMA,
      traefikNetwork: 'internal',
    });
    expect(mockCreate).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
    expect(result.url).toContain('app-dep1dep1');
  });
});
