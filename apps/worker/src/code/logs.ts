/**
 * Publish sandbox log chunks to Redis pub/sub and optionally flush TaskLog.
 */

import type IORedis from 'ioredis';
import { sandboxLogsChannel } from '@aiflow/queue';

import { appendTaskLog } from './status';

export type LogPublisher = {
  publish: (chunk: string) => Promise<void>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

/**
 * Buffer chunks; flush to TaskLog periodically and always publish to Redis.
 */
export function createLogPublisher(args: {
  redis: IORedis;
  schemaName: string;
  taskId: string;
  flushEveryMs?: number;
  now?: () => number;
}): LogPublisher {
  const channel = sandboxLogsChannel(args.taskId);
  const flushEvery = args.flushEveryMs ?? 2_000;
  const now = args.now ?? Date.now;
  let buffer = '';
  let lastFlush = now();

  async function flush(): Promise<void> {
    if (!buffer) return;
    const message = buffer;
    buffer = '';
    lastFlush = now();
    await appendTaskLog(args.schemaName, args.taskId, message);
  }

  return {
    async publish(chunk: string): Promise<void> {
      buffer += chunk;
      await args.redis.publish(channel, chunk);
      if (now() - lastFlush >= flushEvery) await flush();
    },
    flush,
    async close(): Promise<void> {
      await flush();
    },
  };
}
