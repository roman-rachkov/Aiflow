/**
 * Minimal SSE parser for OpenAI-compatible streaming responses (z.ai GLM).
 *
 * Consumes an HTTP `Response.body` byte stream and yields one parsed JSON chunk
 * per `data: {json}` frame. The terminal `data: [DONE]` sentinel and empty /
 * comment-only frames (heartbeats) are skipped. Partial frames split across
 * chunk boundaries are reassembled via a line buffer — only complete frames
 * separated by a blank line are emitted, matching the SSE spec.
 *
 * Package-internal: only the OpenAI-compatible live chat path imports this.
 */

/** One parsed `data:` frame from the z.ai chat-completions SSE stream. */
export interface SseChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Iterate `data:` frames from an SSE byte stream. The reader is released in a
 * `finally` so early `break` or consumer errors do not leak the lock. Throws
 * if `reader.read()` rejects — the caller surfaces that as a stream error.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    // Read until the source signals end. `for(;;)` + `break` avoids the
    // type-narrowing noise that a `while(!done)` flag triggers under
    // strict type-checked rules; `reader.read()` is the single exit point.
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      // SSE frames are separated by a blank line. `\n\n` is canonical; tolerate
      // `\r\n\r\n` from proxies that rewrite line endings.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const chunk = parseFrame(buffer.slice(0, sep));
        if (chunk) yield chunk;
        buffer = buffer.slice(sep + 2);
        sep = buffer.indexOf('\n\n');
      }
    }
    const tail = buffer.trim();
    if (tail.length > 0) {
      const chunk = parseFrame(tail);
      if (chunk) yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Parse one SSE frame into an `SseChunk`, or `null` for non-data / `[DONE]`. */
function parseFrame(frame: string): SseChunk | null {
  for (const line of frame.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload.length === 0 || payload === '[DONE]') return null;
    try {
      return JSON.parse(payload) as SseChunk;
    } catch {
      return null;
    }
  }
  return null;
}
