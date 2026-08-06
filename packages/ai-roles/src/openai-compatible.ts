/**
 * OpenAI-compatible provider: a configurable adapter that serves BOTH streaming
 * chat and embeddings against any OpenAI-compatible endpoint (z.ai GLM, OpenAI,
 * local servers). The single factory {@link createOpenAICompatibleProvider} is
 * the seam task 2.1 RAG builds on — one provider, two capabilities.
 *
 * Two modes, selected at construction:
 * - MOCK: `config.apiKey` absent/empty. Chat streams a canned reply (see
 *   `mock-chat.ts`); `embed` returns a deterministic 768-dim vector per input
 *   (see `mock-embeddings.ts`). No network, no key — local dev + tests.
 * - LIVE: `config.apiKey` present. Real streaming POST to
 *   `${baseURL}/chat/completions` and real `POST ${baseURL}/embeddings`.
 *
 * The live SSE plumbing (parse, role map, usage map) was carried over verbatim
 * from the former `zai-live.ts`; the endpoint is now parameterized instead of
 * hardcoded to the z.ai URL.
 */

import type {
  ChatConfig,
  ChatMessage,
  ChatResult,
  ChatWithUsageResult,
  OpenAICompatibleProvider,
  ProviderConfig,
  ChatRole,
} from './types';
import { mockChatStream, withNullUsageStream } from './mock-chat';
import { mockEmbed } from './mock-embeddings';
import { parseSseStream, type SseChunk } from './sse-parser';

/** Map an internal role to the OpenAI API role string. */
const ROLE_MAP: Record<ChatRole, string> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

/** A decoded live-stream chunk: text delta and, on the final chunk, usage. */
interface LiveChunk {
  text: string;
  usage?: ChatResult;
}

/** Build the messages array for the request body (system prompt first). */
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

/** True when `config.apiKey` is present and non-empty (=> LIVE mode). */
function hasKey(config: ProviderConfig): boolean {
  return Boolean(config.apiKey && config.apiKey.length > 0);
}

/** POST the chat request and yield decoded chunks; throws on non-2xx HTTP. */
async function* streamLiveChat(
  messages: ChatMessage[],
  cfg: ChatConfig,
  provider: ProviderConfig,
): AsyncGenerator<LiveChunk> {
  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: buildApiMessages(messages, cfg.systemPrompt),
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `OpenAICompatibleProvider: chat request failed (${String(response.status)} ${response.statusText})`,
    );
  }
  for await (const chunk of parseSseStream(response.body)) {
    const mapped = mapChunk(chunk);
    if (mapped) yield mapped;
  }
}

/** Live path: drive the streaming request and expose token usage. */
function liveChatWithUsage(
  messages: ChatMessage[],
  cfg: ChatConfig,
  provider: ProviderConfig,
): ChatWithUsageResult {
  let resolved = false;
  let resolveUsage!: (result: ChatResult) => void;
  const usage = new Promise<ChatResult>((resolve) => {
    resolveUsage = resolve;
  });
  const stream = (async function* liveGen() {
    try {
      for await (const chunk of streamLiveChat(messages, cfg, provider)) {
        yield chunk.text;
        if (chunk.usage && !resolved) {
          resolved = true;
          resolveUsage(chunk.usage);
        }
      }
    } finally {
      if (!resolved) {
        resolved = true;
        resolveUsage({ tokensIn: null, tokensOut: null });
      }
    }
  })();
  return { stream, usage };
}

/** Live embeddings: real POST, returns one vector per input in order. */
async function liveEmbed(texts: string[], provider: ProviderConfig): Promise<number[][]> {
  const response = await fetch(`${provider.baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: provider.embeddingModel, input: texts }),
  });
  if (!response.ok) {
    throw new Error(
      `OpenAICompatibleProvider: embeddings request failed (${String(response.status)} ${response.statusText})`,
    );
  }
  const json = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  return (json.data ?? []).map((d) => d.embedding ?? []);
}

/**
 * Construct an {@link OpenAICompatibleProvider}. Reads nothing from the env —
 * the caller (e.g. {@link createProviderFromEnv}) resolves env into a
 * {@link ProviderConfig} so this factory stays pure and testable. MOCK mode is
 * selected when `config.apiKey` is absent/empty.
 */
export function createOpenAICompatibleProvider(config: ProviderConfig): OpenAICompatibleProvider {
  const live = hasKey(config);
  return {
    async *chat(messages, cfg) {
      if (!live) {
        yield* mockChatStream(messages);
        return;
      }
      for await (const chunk of streamLiveChat(messages, cfg, config)) yield chunk.text;
    },
    chatWithUsage(messages, cfg) {
      if (!live) {
        return Promise.resolve(withNullUsageStream(mockChatStream(messages)));
      }
      return Promise.resolve(liveChatWithUsage(messages, cfg, config));
    },
    async embed(texts) {
      return live ? liveEmbed(texts, config) : mockEmbed(texts);
    },
  };
}
