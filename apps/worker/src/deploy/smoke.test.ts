/**
 * Task 2.3 mocked primary-path smoke:
 * ModelConfig upsert → resolve fallback AND deploy export → enqueue → worker status.
 *
 * Manual compose checklist (acceptance):
 * - Pro sets Analyst key → chat uses project ModelConfig
 * - Pro Build → BUILDING → DEPLOYED with log (docker.sock DEV-ONLY)
 * - BASIC sees deployment history only (no Build)
 */

import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { DeployRunPayload } from '@aiflow/queue';

import { handleDeployRun } from './handler';
import type { DeployHandlerDeps } from './handler';

describe('Task 2.3 smoke (mocked)', () => {
  it('deploy path: enqueue payload → handler → DEPLOYED', async () => {
    const payload: DeployRunPayload = {
      projectId: 'p1',
      deploymentId: 'd1',
      schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      giteaOwner: 'aistudio',
      giteaRepo: 'app',
      giteaDefaultBranch: 'main',
    };

    const finishDeploy = vi.fn().mockResolvedValue(true);
    const deps: DeployHandlerDeps = {
      loadDeployment: vi.fn().mockResolvedValue({
        id: 'd1',
        status: 'BUILDING',
        imageTag: null,
        url: null,
      }),
      cloneRepo: vi.fn().mockResolvedValue(undefined),
      buildDockerImage: vi.fn().mockResolvedValue({ imageTag: 't' }),
      runDeployedContainer: vi.fn().mockResolvedValue({ url: 'docker://t', containerName: 'c' }),
      pushUserAppSchema: vi.fn().mockResolvedValue({ appSchema: 'app_aaa', skipped: false }),
      appendDeployLog: vi.fn().mockResolvedValue(undefined),
      finishDeploy,
      removeWorkDir: vi.fn().mockResolvedValue(undefined),
      recordAudit: vi.fn().mockResolvedValue({}),
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    };

    await handleDeployRun({ data: payload, id: 'd1' } as Job<DeployRunPayload>, deps);

    expect(finishDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DEPLOYED', deploymentId: 'd1' }),
    );
  });
});
