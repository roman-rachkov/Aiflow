/**
 * Live HTTP path for {@link ZaiProvider}: a real streaming request to the
 * OpenAI-compatible z.ai GLM endpoint.
 *
 * Exposed as a single generator, {@link streamLiveChat}, which performs the
 * POST, decodes the SSE stream, and yields one {@link LiveChunk} per frame:
 * the text delta plus (on the final frame) token usage. Throws on non-2xx HTTP
 * or a stream-read error — the caller (ZaiProvider) surfaces that by throwing
 * from its async generator so the route handler can map it to an SSE error
 * frame. Role mapping, request-body construction, and SSE frame mapping live
 * here so zai-provider.ts stays under the 200-line limit.
 */

import type { ChatConfig, ChatMessage, ChatResult, ChatRole } from './types';
import { parseSseStream, type SseChunk } from './sse-parser';

/** z.ai chat-completions endpoint (OpenAI-compatible). */
const ZAI_ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';

/** Map an internal role to the z.ai/OpenAI API role string. */
const ROLE_MAP: Record<ChatRole, string> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

/** A decoded live-stream chunk: text delta and, on the final chunk, usage. */
export interface LiveChunk {
  text: string;
  usage?: ChatResult;
}

/** Build the messages array for the z.ai request body (system prompt first). */
function buildApiMessages(
  messages: ChatMessage[],
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: ROLE_MAP[m.role], content: m.content })),
  ];
}

/** Map an `SseChunk` to a `LiveChunk`, or `undefined` if it carries nothing. */
function mapChunk(chunk: SseChunk): LiveChunk | undefined {
  const text = chunk.choices?.[0]?.delta?.content ?? '';
  let usage: ChatResult | undefined;
  if (chunk.usage) {
    usage = {
      tokensIn: chunk.usage.prompt_tokens ?? null,
      tokensOut: chunk.usage.completion_tokens ?? null,
    };
  }
  if (text.length === 0 && !usage) return undefined;
  return { text, usage };
}

/**
 * POST the chat request to z.ai and yield decoded text chunks (and the final
 * usage, if present). Throws on non-2xx HTTP or stream read error — the route
 * handler maps the thrown error to an SSE error frame.
 */
export async function* streamLiveChat(
  messages: ChatMessage[],
  config: ChatConfig,
  apiKey: string,
): AsyncGenerator<LiveChunk> {
  const response = await fetch(ZAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildApiMessages(messages, config.systemPrompt),
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `ZaiProvider: z.ai request failed (${String(response.status)} ${response.statusText})`,
    );
  }
  for await (const chunk of parseSseStream(response.body)) {
    const mapped = mapChunk(chunk);
    if (mapped) yield mapped;
  }
}
