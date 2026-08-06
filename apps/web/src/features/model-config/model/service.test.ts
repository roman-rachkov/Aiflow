import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const encrypt = vi.fn((plain: string) => ({
  __encrypted__: Buffer.from(plain).toString('base64'),
}));
const decrypt = vi.fn((env: { __encrypted__: string }) =>
  Buffer.from(env.__encrypted__, 'base64').toString('utf8'),
);
const asEncryptedValue = vi.fn((v: unknown) => v as { __encrypted__: string });
const findFirst = vi.fn();
const upsert = vi.fn();
const readProviderConfigFromEnv = vi.fn(() => ({
  baseURL: 'http://localhost:1234/v1',
  apiKey: 'env-key',
  chatModel: 'env-model',
  embeddingModel: 'env-embed',
}));

vi.mock('@aiflow/crypto', () => ({ encrypt, decrypt }));
vi.mock('@aiflow/db', () => ({
  asEncryptedValue,
  getProjectClient: () => ({ modelConfig: { findFirst, upsert } }),
}));
vi.mock('@aiflow/ai-roles', () => ({ readProviderConfigFromEnv }));

const { getAnalystModelConfig, upsertAnalystModelConfig } = await import('./service');

const SCHEMA = 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

beforeEach(() => {
  findFirst.mockReset();
  upsert.mockReset();
  encrypt.mockClear();
  decrypt.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getAnalystModelConfig', () => {
  it('returns env fallback when no row', async () => {
    findFirst.mockResolvedValue(null);
    const res = await getAnalystModelConfig(SCHEMA);
    expect(res.source).toBe('env');
    expect(res.analyst.model).toBe('env-model');
    expect(res.analyst).not.toHaveProperty('apiKey');
  });

  it('returns hasApiKey without plaintext key', async () => {
    const blob = JSON.stringify({
      analyst: { provider: 'openai', model: 'gpt-4o', apiKey: 'secret' },
    });
    findFirst.mockResolvedValue({
      config: { __encrypted__: Buffer.from(blob).toString('base64') },
    });
    decrypt.mockImplementation((env: { __encrypted__: string }) =>
      Buffer.from(env.__encrypted__, 'base64').toString('utf8'),
    );

    const res = await getAnalystModelConfig(SCHEMA);
    expect(res.source).toBe('project');
    expect(res.analyst.hasApiKey).toBe(true);
    expect(JSON.stringify(res)).not.toContain('secret');
  });
});

describe('upsertAnalystModelConfig', () => {
  it('encrypts the full analyst blob', async () => {
    findFirst.mockResolvedValue(null);
    upsert.mockResolvedValue({});

    await upsertAnalystModelConfig(SCHEMA, 'proj-1', {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'new-key',
    });

    expect(encrypt).toHaveBeenCalled();
    const plain = encrypt.mock.calls[0]?.[0] ?? '';
    expect(JSON.parse(plain)).toMatchObject({
      analyst: { provider: 'openai', model: 'gpt-4o', apiKey: 'new-key' },
    });
    expect(upsert).toHaveBeenCalled();
  });

  it('clearApiKey removes the project key', async () => {
    const prev = JSON.stringify({
      analyst: { provider: 'openai', model: 'gpt-4o', apiKey: 'keep-me' },
    });
    findFirst.mockResolvedValue({
      config: { __encrypted__: Buffer.from(prev).toString('base64') },
    });
    decrypt.mockReturnValue(prev);
    upsert.mockResolvedValue({});

    await upsertAnalystModelConfig(SCHEMA, 'proj-1', {
      provider: 'openai',
      model: 'gpt-4o',
      clearApiKey: true,
    });

    const plain = encrypt.mock.calls[0]?.[0] ?? '';
    const parsed = JSON.parse(plain) as { analyst: { apiKey?: string } };
    expect(parsed.analyst.apiKey).toBeUndefined();
  });
});
