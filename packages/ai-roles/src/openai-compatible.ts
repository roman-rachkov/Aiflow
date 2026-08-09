/**
 * OpenAI-compatible provider: a configurable adapter that serves BOTH streaming
 * chat (plain + tool-aware) and embeddings against any OpenAI-compatible
 * endpoint (z.ai GLM, OpenAI, local servers). The single factory
 * {@link createOpenAICompatibleProvider} is the seam task 2.1 RAG builds on.
 *
 * Two modes, selected at construction:
 * - MOCK: `config.apiKey` absent/empty. Chat streams a canned reply (see
 *   `mock-chat.ts`); `embed` returns a deterministic 768-dim vector per input
 *   (see `mock-embeddings.ts`). No network, no key — local dev + tests.
 * - LIVE: `config.apiKey` present. Real streaming POST to
 *   `${baseURL}/chat/completions` and real `POST ${baseURL}/embeddings`.
 *
 * The live SSE plumbing (parse, role map, usage map, tool-call mapping) lives
 * in `live-chat.ts`; this module owns the factory + embeddings.
 */

import type { OpenAICompatibleProvider, ProviderConfig } from './types';
import { liveChatWithTools, liveChatWithUsage, streamLiveChat } from './live-chat';
import { mockChatStream, withNullUsageStream } from './mock-chat';
import { mockEmbed } from './mock-embeddings';

/** True when `config.apiKey` is present and non-empty (=> LIVE mode). */
function hasKey(config: ProviderConfig): boolean {
  return Boolean(config.apiKey && config.apiKey.length > 0);
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
    chatWithTools(messages, cfg) {
      if (!live) {
        // MOCK has no tool support; surface the canned text as text events.
        const stream = (async function* mockGen() {
          for await (const text of mockChatStream(messages)) {
            yield { type: 'text' as const, text };
          }
        })();
        return Promise.resolve({
          stream,
          usage: Promise.resolve({ tokensIn: null, tokensOut: null }),
        });
      }
      return Promise.resolve(liveChatWithTools(messages, cfg, config));
    },
    async embed(texts) {
      return live ? liveEmbed(texts, config) : mockEmbed(texts);
    },
  };
}
