import { afterEach, describe, expect, it, vi } from 'vitest';

const requireUser = vi.fn();
const resolveProjectSchema = vi.fn();
const getAnalystModelConfig = vi.fn();
const upsertAnalystModelConfig = vi.fn();
const assertProModelConfig = vi.fn(() => null);
const isEncryptionKeyError = vi.fn(() => false);

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@/features/model-config', () => ({
  assertProModelConfig,
  getAnalystModelConfig,
  upsertAnalystModelConfig,
  isEncryptionKeyError,
  ANALYST_PROVIDERS: ['openai', 'routerai'],
  ModelConfigValidationError: class ModelConfigValidationError extends Error {},
}));

const { GET, PUT } = await import('./route');

afterEach(() => {
  vi.clearAllMocks();
  assertProModelConfig.mockReturnValue(null);
});

describe('GET /model-config gates', () => {
  it('returns 403 for BASIC', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'BASIC' });
    assertProModelConfig.mockReturnValue(
      Response.json({ error: 'forbidden' }, { status: 403 }) as never,
    );

    const res = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 404 when project missing', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
    resolveProjectSchema.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /model-config', () => {
  it('returns 200 on success', async () => {
    requireUser.mockResolvedValue({ id: 'u1', uiMode: 'PRO' });
    resolveProjectSchema.mockResolvedValue('project_aa');
    upsertAnalystModelConfig.mockResolvedValue({
      analyst: { provider: 'openai', model: 'm', baseURL: null, hasApiKey: true },
      source: 'project',
    });

    const res = await PUT(
      new Request('http://localhost/x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analyst: { provider: 'openai', model: 'm' },
        }),
      }),
      { params: Promise.resolve({ id: 'p1' }) },
    );
    expect(res.status).toBe(200);
  });
});
