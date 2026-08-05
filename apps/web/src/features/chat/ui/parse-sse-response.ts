/**
 * SSE stream reader for the chat route.
 *
 * The route (apps/web/src/app/api/projects/[id]/chat/route.ts) emits three
 * frame shapes over a `text/event-stream` body:
 *
 *   data: {"content":"chunk"}   — a text delta, accumulated by the caller
 *   data: [DONE]                — terminator, the stream ends cleanly
 *   event: error\ndata: {...}   — server-side failure; payload has `.message`
 *
 * This helper is a thin async generator that yields each `content` delta as a
 * string and throws on `event: error`. It owns only the framing (splitting on
 * the blank-line separator, finding the `data:` line); the JSON shape is the
 * route's contract, not assistant-ui's. Kept under 50 lines so
 * `max-lines-per-function` stays green without an eslint-disable.
 */

/** Read `body` as SSE, yielding `{ content }` text deltas. Throws on error frames. */
export async function* parseSseResponse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. The final partial chunk stays
      // in the buffer until the next read completes it.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) yield* parseFrame(frame);
    }
    // Flush any trailing frame that lacked its terminating blank line.
    if (buffer.trim().length > 0) yield* parseFrame(buffer);
  } finally {
    reader.releaseLock();
  }
}

/** Parse one SSE frame: throw on `event: error`, yield content deltas otherwise. */
function* parseFrame(frame: string): Generator<string, void, unknown> {
  if (frame.startsWith('event: error')) {
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    const payload = line?.slice(6) ?? '{}';
    const message = (JSON.parse(payload) as { message?: string }).message;
    throw new Error(message ?? 'Сервер вернул ошибку');
  }
  const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
  if (!dataLine) return;
  const payload = dataLine.slice(6);
  if (payload === '[DONE]') return;
  const parsed = JSON.parse(payload) as { content?: string };
  if (typeof parsed.content === 'string') yield parsed.content;
}
