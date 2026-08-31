import { describe, expect, it, vi } from 'vitest';

import { makeCacheKey, tryGetCache, trySetCache } from './cache';

describe('makeCacheKey', () => {
  it('starts with the mr:chat: prefix', () => {
    expect(makeCacheKey({})).toMatch(/^mr:chat:[0-9a-f]{64}$/);
  });

  it('produces the same key regardless of property order', () => {
    const a = makeCacheKey({ model: 'gpt-4', messages: [] });
    const b = makeCacheKey({ messages: [], model: 'gpt-4' });
    expect(a).toBe(b);
  });

  it('produces different keys for different values', () => {
    const a = makeCacheKey({ model: 'gpt-4' });
    const b = makeCacheKey({ model: 'gpt-3.5' });
    expect(a).not.toBe(b);
  });

  it('handles nested objects stably', () => {
    const a = makeCacheKey({ messages: [{ role: 'user', content: 'hi' }] });
    const b = makeCacheKey({ messages: [{ content: 'hi', role: 'user' }] });
    expect(a).toBe(b);
  });
});

describe('tryGetCache', () => {
  it('returns null when Redis get fails', async () => {
    const fakeRedis = { get: vi.fn().mockRejectedValue(new Error('down')) };
    const result = await tryGetCache(fakeRedis as never, 'key');
    expect(result).toBeNull();
  });

  it('returns the cached value when Redis responds', async () => {
    const fakeRedis = { get: vi.fn().mockResolvedValue('{"ok":true}') };
    const result = await tryGetCache(fakeRedis as never, 'key');
    expect(result).toBe('{"ok":true}');
  });
});

describe('trySetCache', () => {
  it('silently ignores Redis errors', async () => {
    const fakeRedis = { set: vi.fn().mockRejectedValue(new Error('down')) };
    await expect(trySetCache(fakeRedis as never, 'key', 'value')).resolves.toBeUndefined();
  });

  it('calls set with 1h TTL', async () => {
    const fakeRedis = { set: vi.fn().mockResolvedValue('OK') };
    await trySetCache(fakeRedis as never, 'key', 'value');
    expect(fakeRedis.set).toHaveBeenCalledWith('key', 'value', 'EX', 3600);
  });
});
