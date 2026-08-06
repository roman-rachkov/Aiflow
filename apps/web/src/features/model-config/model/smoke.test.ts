/**
 * ModelConfig resolve + encrypt smoke (mocked). Complements worker deploy smoke.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const encrypt = vi.fn((plain: string) => ({
  __encrypted__: Buffer.from(plain).toString('base64'),
}));
const decrypt = vi.fn((env: { __encrypted__: string }) =>
  Buffer.from(env.__encrypted__, 'base64').toString('utf8'),
);
const findFirst = vi.fn();
const upsert = vi.fn();
const createOpenAICompatibleProvider = vi.fn(() => ({ kind: 'project' }));
const createProviderFromEnv = vi.fn(() => ({ kind: 'env' }));
const readProviderConfigFromEnv = vi.fn(() => ({
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'env-key',
  chatModel: 'env-model',
  embeddingModel: 'env-embed',
}));

vi.mock('@aiflow/crypto', () => ({ encrypt, decrypt }));
vi.mock('@aiflow/db', () => ({
  asEncryptedValue: (v: unknown) => v,
  getProjectClient: () => ({ modelConfig: { findFirst, upsert } }),
}));
vi.mock('@aiflow/ai-roles', () => ({
  createOpenAICompatibleProvider,
  createProviderFromEnv,
  readProviderConfigFromEnv,
}));

const { upsertAnalystModelConfig } = await import('./service');
const { resolveAnalystProvider } = await import('./resolve-provider');

const SCHEMA = 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Task 2.3 ModelConfig smoke (mocked)', () => {
  it('upsert then resolve uses project key; missing falls back to env', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await upsertAnalystModelConfig(SCHEMA, 'p1', {
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'proj-secret',
    });
    expect(encrypt).toHaveBeenCalled();

    const blob = encrypt.mock.calls[0][0];
    findFirst.mockResolvedValue({
      config: { __encrypted__: Buffer.from(blob).toString('base64') },
    });
    decrypt.mockReturnValue(blob);

    const resolved = await resolveAnalystProvider(SCHEMA);
    expect(resolved.source).toBe('project');
    expect(createOpenAICompatibleProvider).toHaveBeenCalled();

    findFirst.mockResolvedValue(null);
    const envResolved = await resolveAnalystProvider(SCHEMA);
    expect(envResolved.source).toBe('env');
    expect(createProviderFromEnv).toHaveBeenCalled();
  });
});
