/**
 * Redis → SSE bridge for `chat:run` AG-UI events.
 *
 * Awaits Redis subscribe before resolving. Buffers frames that arrive before
 * the ReadableStream `start` hook so early worker publishes are not dropped.
 */

import type Redis from 'ioredis';
import { chatRunChannel, createRedisConnection } from '@aiflow/queue';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

const encoder = new TextEncoder();

function encodeSse(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function isTerminal(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const type = (payload as { type?: unknown }).type;
  return type === 'RUN_FINISHED' || type === 'RUN_ERROR';
}

type BridgeState = {
  closed: boolean;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  pending: unknown[];
};

/** Subscribe to `chat:run:{runId}`, then return an SSE Response. */
export async function openChatRunBridge(runId: string, signal: AbortSignal): Promise<Response> {
  const channel = chatRunChannel(runId);
  const redis = createRedisConnection();
  await redis.subscribe(channel);
  const state: BridgeState = { closed: false, controller: null, pending: [] };
  const cleanup = createBridgeCleanup({ state, redis, channel, signal, runId });
  signal.addEventListener('abort', cleanup);
  return new Response(makeBody(state, cleanup), { headers: SSE_HEADERS });
}

type CleanupArgs = {
  state: BridgeState;
  redis: Redis;
  channel: string;
  signal: AbortSignal;
  runId: string;
};

function createBridgeCleanup(args: CleanupArgs): () => void {
  const { state, redis, channel, signal, runId } = args;
  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    signal.removeEventListener('abort', cleanup);
    redis.off('message', onMessage);
    void redis.unsubscribe(channel).finally(() => {
      void redis.quit();
    });
    try {
      state.controller?.close();
    } catch {
      /* already closed */
    }
  };

  const deliver = (payload: unknown) => {
    if (state.closed) return;
    if (!state.controller) {
      state.pending.push(payload);
      return;
    }
    state.controller.enqueue(encodeSse(payload));
    if (isTerminal(payload)) cleanup();
  };

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel || state.closed) return;
    try {
      deliver(JSON.parse(message));
    } catch {
      deliver({ type: 'RUN_ERROR', message: 'Bad event frame', runId });
    }
  };
  redis.on('message', onMessage);
  return cleanup;
}

function makeBody(state: BridgeState, cleanup: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      state.controller = controller;
      for (const payload of state.pending) {
        controller.enqueue(encodeSse(payload));
        if (isTerminal(payload)) {
          cleanup();
          return;
        }
      }
      state.pending.length = 0;
    },
    cancel() {
      cleanup();
    },
  });
}
