import IORedis from 'ioredis';

/**
 * Shared Redis connection for BullMQ producers and consumers.
 * `maxRetriesPerRequest: null` is required by BullMQ blocking commands.
 */
export function createRedisConnection(url = process.env.REDIS_URL): IORedis {
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
}
