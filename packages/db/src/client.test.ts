import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  PROJECT_SCHEMA_PATTERN,
  cachedProjectClientCount,
  disconnectAll,
  evictProjectClient,
  getProjectClient,
} from './index';

/**
 * Guards the isolation boundary from docs/03-data-model.md § 4 and the C1
 * decision in docs/14-decisions-needed.md. Two things are expensive to get
 * wrong here: a schema name reaching the connection string unvalidated, and a
 * cache that never releases clients.
 *
 * The generated Prisma clients are stubbed — these tests are about the caching
 * and validation logic, not about talking to PostgreSQL. Integration against a
 * real database belongs with the project-provisioning API in task 1.2.
 */
vi.mock('../generated/public', () => ({
  PrismaClient: class {
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../generated/project', () => ({
  PrismaClient: class {
    constructor(public options?: unknown) {}
    $disconnect = vi.fn().mockResolvedValue(undefined);
  },
}));

// Set here rather than relying on a .env file: these tests never connect, but
// the URL builder needs a syntactically valid base to substitute the schema
// into, and a test that depends on ambient environment is a test that passes on
// one machine and fails on another.
beforeAll(() => {
  process.env.DATABASE_URL ??=
    'postgresql://ai_studio:ai_studio@localhost:5432/ai_studio?schema=public';
});

afterEach(async () => {
  await disconnectAll();
});

describe('project schema name validation', () => {
  it.each(['project_abc123', 'project_a_b_c', 'project_0'])('accepts %s', (name) => {
    expect(PROJECT_SCHEMA_PATTERN.test(name)).toBe(true);
  });

  it.each([
    'public',
    'Project_ABC', // uppercase
    'project-abc', // hyphen
    'project_abc; DROP SCHEMA public', // the reason this check exists
    'proj_abc',
    '',
  ])('rejects %s', (name) => {
    expect(PROJECT_SCHEMA_PATTERN.test(name)).toBe(false);
    expect(() => getProjectClient(name)).toThrow(/Invalid project schema name/);
  });
});

describe('client cache', () => {
  it('returns the same instance for one schema', () => {
    const a = getProjectClient('project_cache');
    const b = getProjectClient('project_cache');
    expect(a).toBe(b);
    expect(cachedProjectClientCount()).toBe(1);
  });

  it('keeps separate instances per schema', () => {
    const a = getProjectClient('project_one');
    const b = getProjectClient('project_two');
    expect(a).not.toBe(b);
    expect(cachedProjectClientCount()).toBe(2);
  });

  it('releases a client on eviction', async () => {
    getProjectClient('project_evict');
    expect(cachedProjectClientCount()).toBe(1);

    await evictProjectClient('project_evict');
    expect(cachedProjectClientCount()).toBe(0);
  });

  it('evicting an unknown schema is a no-op', async () => {
    await expect(evictProjectClient('project_missing')).resolves.toBeUndefined();
  });

  it('hands out a fresh client after eviction', async () => {
    const before = getProjectClient('project_reuse');
    await evictProjectClient('project_reuse');
    const after = getProjectClient('project_reuse');

    expect(after).not.toBe(before);
  });
});
