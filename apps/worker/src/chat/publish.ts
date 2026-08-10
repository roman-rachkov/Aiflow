/**
 * Publish AG-UI event JSON to Redis for the Next SSE bridge.
 */

import type Redis from 'ioredis';
import { chatRunChannel, createRedisConnection } from '@aiflow/queue';

export type AguiEmitter = {
  emit: (payload: unknown) => Promise<void>;
  close: () => Promise<void>;
};

/** Open a Redis publisher bound to `chat:run:{runId}`. */
export function createAguiPublisher(runId: string): AguiEmitter {
  const redis: Redis = createRedisConnection();
  const channel = chatRunChannel(runId);
  return {
    emit: async (payload: unknown) => {
      await redis.publish(channel, JSON.stringify(payload));
    },
    close: async () => {
      await redis.quit();
    },
  };
}
