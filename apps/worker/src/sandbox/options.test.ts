import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AIDER_IMAGE,
  DEFAULT_SANDBOX_NETWORK,
  SANDBOX_API_KEY_MOUNT,
  buildSandboxContainerOptions,
} from './options';

const BASE = {
  workspaceHostPath: '/data/ws',
  apiKeyHostPath: '/secrets/key',
  task: { title: 'T', description: 'D', acceptance: 'A' },
  env: {} as NodeJS.ProcessEnv,
};

describe('buildSandboxContainerOptions', () => {
  it('applies hardening defaults', () => {
    const opts = buildSandboxContainerOptions(BASE);
    expect(opts.Image).toBe(DEFAULT_AIDER_IMAGE);
    expect(opts.HostConfig.NetworkMode).toBe(DEFAULT_SANDBOX_NETWORK);
    expect(opts.HostConfig.ReadonlyRootfs).toBe(true);
    expect(opts.HostConfig.CapDrop).toEqual(['ALL']);
    expect(opts.HostConfig.SecurityOpt).toEqual(['no-new-privileges']);
    expect(opts.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(opts.HostConfig.NanoCpus).toBe(1_000_000_000);
  });

  it('binds workspace and read-only api_key secret', () => {
    const opts = buildSandboxContainerOptions(BASE);
    expect(opts.HostConfig.Binds).toContain('/data/ws:/workspace');
    expect(opts.HostConfig.Binds).toContain(`/secrets/key:${SANDBOX_API_KEY_MOUNT}:ro`);
    expect(opts.Env.join('\n')).not.toMatch(/API_KEY=/);
  });

  it('reads image and network from env', () => {
    const opts = buildSandboxContainerOptions({
      ...BASE,
      env: {
        AIDER_SANDBOX_IMAGE: 'custom/aider:1',
        SANDBOX_NETWORK: 'compose_sandbox',
      },
    });
    expect(opts.Image).toBe('custom/aider:1');
    expect(opts.HostConfig.NetworkMode).toBe('compose_sandbox');
  });

  it('embeds TASK_JSON without API_KEY', () => {
    const opts = buildSandboxContainerOptions({
      ...BASE,
      modelProvider: 'routerai',
      modelName: 'x',
      apiBaseUrl: 'http://model-router:3001',
    });
    expect(opts.Env).toContain('MODEL_PROVIDER=routerai');
    expect(opts.Env).toContain('MODEL_NAME=x');
    expect(opts.Env).toContain('API_BASE_URL=http://model-router:3001');
    const taskEnv = opts.Env.find((e) => e.startsWith('TASK_JSON='));
    expect(taskEnv).toContain('"title":"T"');
  });
});
