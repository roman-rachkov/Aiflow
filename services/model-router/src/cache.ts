/**
 * Redis best-effort cache for chat completion responses.
 * Non-streaming identical requests are cached for 1 hour.
 */

import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';

const CACHE_TTL_SECS = 3600;
const KEY_PREFIX = 'mr:chat:';

/**
 * Produce a deterministic cache key from a request body.
 * Key order is normalised so {a,b} and {b,a} map to the same key.
 */
export function makeCacheKey(body: unknown): string {
  const stable = stableStringify(body);
  return KEY_PREFIX + createHash('sha256').update(stable).digest('hex');
}

export async function tryGetCache(redis: Redis, key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function trySetCache(redis: Redis, key: string, value: string): Promise<void> {
  try {
    await redis.set(key, value, 'EX', CACHE_TTL_SECS);
  } catch {
    // cache is best-effort — silently drop failures
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k]));
  return '{' + sorted.join(',') + '}';
}
