import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { DeployRunPayload } from '@aiflow/queue';

import { handleDeployRun, makeImageTag, validateDeployPayload } from './handler';
import type { DeployHandlerDeps } from './handler';

const PAYLOAD: DeployRunPayload = {
  projectId: 'proj-1',
  deploymentId: 'dep-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  giteaOwner: 'aistudio',
  giteaRepo: 'demo',
  giteaDefaultBranch: 'main',
};

function job(data: DeployRunPayload): Job<DeployRunPayload> {
  return { data, id: data.deploymentId } as Job<DeployRunPayload>;
}

function mockDeps(overrides: Partial<DeployHandlerDeps> = {}): DeployHandlerDeps {
  return {
    loadDeployment: vi.fn(() =>
      Promise.resolve({
        id: PAYLOAD.deploymentId,
        status: 'BUILDING' as const,
        imageTag: null,
        url: null,
      }),
    ),
    cloneRepo: vi.fn(() => Promise.resolve()),
    buildDockerImage: vi.fn(() => Promise.resolve({ imageTag: 'aistudio/demo:tag' })),
    pushUserAppSchema: vi.fn(() => Promise.resolve({ appSchema: 'app_aaa', skipped: false })),
    appendDeployLog: vi.fn(() => Promise.resolve()),
    finishDeploy: vi.fn(() => Promise.resolve(true)),
    removeWorkDir: vi.fn(() => Promise.resolve()),
    recordAudit: vi.fn(() => Promise.resolve({})),
    now: () => new Date('2026-08-07T02:00:00.000Z'),
    ...overrides,
  };
}

describe('validateDeployPayload', () => {
  it('rejects missing fields', () => {
    expect(() => {
      validateDeployPayload({ ...PAYLOAD, giteaRepo: '' });
    }).toThrow(/giteaRepo/);
  });
});

describe('makeImageTag', () => {
  it('uses repo and timestamp', () => {
    expect(makeImageTag('demo', new Date('2026-08-07T02:00:00.000Z'))).toBe(
      'aistudio/demo:20260807020000',
    );
  });
});

describe('handleDeployRun success', () => {
  it('success → DEPLOYED with imageTag and stub url', async () => {
    const deps = mockDeps();
    await handleDeployRun(job(PAYLOAD), deps);

    expect(deps.cloneRepo).toHaveBeenCalled();
    expect(deps.buildDockerImage).toHaveBeenCalled();
    expect(deps.finishDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DEPLOYED',
        imageTag: 'aistudio/demo:20260807020000',
        url: 'docker://aistudio/demo:20260807020000',
      }),
    );
    expect(deps.removeWorkDir).toHaveBeenCalled();
  });

  it('skips when already DEPLOYED', async () => {
    const deps = mockDeps({
      loadDeployment: vi.fn(() =>
        Promise.resolve({
          id: PAYLOAD.deploymentId,
          status: 'DEPLOYED' as const,
          imageTag: 'aistudio/demo:old',
          url: 'docker://aistudio/demo:old',
        }),
      ),
    });
    await handleDeployRun(job(PAYLOAD), deps);
    expect(deps.cloneRepo).not.toHaveBeenCalled();
    expect(deps.buildDockerImage).not.toHaveBeenCalled();
    expect(deps.appendDeployLog).toHaveBeenCalledWith(
      PAYLOAD.schemaName,
      PAYLOAD.deploymentId,
      expect.stringContaining('DEPLOYED'),
    );
  });
});

describe('handleDeployRun failures', () => {
  it('failure → FAILED with log message; cleans temp', async () => {
    const deps = mockDeps({
      buildDockerImage: vi.fn().mockRejectedValue(new Error('build blew up')),
    });

    await expect(handleDeployRun(job(PAYLOAD), deps)).rejects.toThrow(/build blew up/);

    expect(deps.finishDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        logChunk: expect.stringContaining('build blew up'),
      }),
    );
    expect(deps.removeWorkDir).toHaveBeenCalled();
  });

  it('does not swallow build errors (fail-fast for retries)', async () => {
    const deps = mockDeps({
      cloneRepo: vi.fn().mockRejectedValue(new Error('clone failed')),
    });
    await expect(handleDeployRun(job(PAYLOAD), deps)).rejects.toThrow(/clone failed/);
  });
});

/**
 * Local smoke (manual): with compose docker.sock mounted, run a real deploy:run
 * job against a provisioned project — not required in CI.
 */
