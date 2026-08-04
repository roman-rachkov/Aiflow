import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the access checks in ./guards.ts.
 *
 * `redirect` is mocked to *throw*, mirroring the real NEXT_REDIRECT control
 * flow. A mock that merely records the call would let execution continue past a
 * guard, and a test asserting "unauthorised users are redirected" would pass
 * even if the guard let them through.
 */

const findUnique = vi.fn();

vi.mock('@aiflow/db', () => ({
  getPublicClient: () => ({ projectMeta: { findUnique } }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// Typed rather than a bare `vi.fn()`: an untyped mock returns `any`, and
// `no-unsafe-return` is an error under strict-type-checked.
const auth = vi.fn<() => Promise<unknown>>();
vi.mock('./nextauth', () => ({ auth: () => auth() }));

const { canAccessProject, requireProMode, requireUser } = await import('./guards');

afterEach(() => {
  vi.clearAllMocks();
});

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'u1', email: 'a@b.c', name: 'Аня', uiMode: 'BASIC', ...overrides },
  };
}

describe('requireUser', () => {
  it('returns the signed-in user', async () => {
    auth.mockResolvedValue(session());
    await expect(requireUser()).resolves.toEqual({
      id: 'u1',
      email: 'a@b.c',
      name: 'Аня',
      uiMode: 'BASIC',
    });
  });

  it('redirects to /signin when there is no session', async () => {
    auth.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow('REDIRECT:/signin');
  });

  it('redirects when a session exists but carries no user id', async () => {
    auth.mockResolvedValue({ user: { email: 'a@b.c' } });
    await expect(requireUser()).rejects.toThrow('REDIRECT:/signin');
  });

  it('never exposes a password hash', async () => {
    auth.mockResolvedValue(session({ passwordHash: 'leaked' }));
    const user = await requireUser();
    expect(user).not.toHaveProperty('passwordHash');
  });
});

describe('requireProMode', () => {
  it('admits a PRO user', async () => {
    auth.mockResolvedValue(session({ uiMode: 'PRO' }));
    await expect(requireProMode()).resolves.toMatchObject({ uiMode: 'PRO' });
  });

  it('sends a BASIC user home rather than to sign-in', async () => {
    auth.mockResolvedValue(session({ uiMode: 'BASIC' }));
    await expect(requireProMode()).rejects.toThrow('REDIRECT:/');
  });

  it('sends an anonymous visitor to sign-in', async () => {
    auth.mockResolvedValue(null);
    await expect(requireProMode()).rejects.toThrow('REDIRECT:/signin');
  });
});

describe('canAccessProject', () => {
  it('admits the owner', async () => {
    findUnique.mockResolvedValue({ ownerId: 'u1', status: 'ACTIVE' });
    await expect(canAccessProject('u1', 'p1')).resolves.toBe(true);
  });

  it('refuses a non-owner', async () => {
    findUnique.mockResolvedValue({ ownerId: 'someone-else', status: 'ACTIVE' });
    await expect(canAccessProject('u1', 'p1')).resolves.toBe(false);
  });

  it('refuses a missing project', async () => {
    findUnique.mockResolvedValue(null);
    await expect(canAccessProject('u1', 'gone')).resolves.toBe(false);
  });

  it('refuses a soft-deleted project even to its owner', async () => {
    // Soft-deleted projects are filtered out by the query's `deletedAt: null`
    // clause, so findUnique returns null — the project behaves as if gone.
    findUnique.mockResolvedValue(null);
    await expect(canAccessProject('u1', 'p1')).resolves.toBe(false);
  });

  it('admits the owner of an archived project', async () => {
    findUnique.mockResolvedValue({ ownerId: 'u1', status: 'ARCHIVED' });
    await expect(canAccessProject('u1', 'p1')).resolves.toBe(true);
  });
});
