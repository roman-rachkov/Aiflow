/**
 * ZaiProvider — thin z.ai-configured adapter over the generic
 * OpenAI-compatible provider.
 *
 * Reads env ONCE inside the factory (not at module top-level) so it stays
 * testable, then hands a {@link ProviderConfig} to
 * {@link createOpenAICompatibleProvider}. Two modes, selected by the resolved
 * API key:
 * - MOCK: `OPENAI_API_KEY` / `ZAI_API_KEY` unset/empty. Streams a canned
 *   Russian analyst follow-up; `embed` returns deterministic 1536-dim vectors.
 * - LIVE: key present. Real streaming POST to the z.ai OpenAI-compatible
 *   endpoint; real embeddings.
 *
 * The `ZaiProvider` class is retained so the existing test API
 * (`new ZaiProvider()`, `process.env.ZAI_API_KEY`) keeps working unchanged; it
 * simply delegates to the shared provider.
 */

import type {
  ChatConfig,
  ChatMessage,
  ChatWithUsageResult,
  OpenAICompatibleProvider,
  ProviderConfig,
  StreamingProvider,
} from './types';
import { createOpenAICompatibleProvider } from './openai-compatible';

/** Default z.ai OpenAI-compatible API root. */
const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';

/** Default chat model id on z.ai. */
const ZAI_DEFAULT_CHAT_MODEL = 'glm-4.6';

/** Default embedding model id (OpenAI text-embedding-3-small, dim 1536). */
const ZAI_DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Read the z.ai provider config from env, called lazily inside the factory. */
function readZaiConfig(): ProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ZAI_API_KEY;
  return {
    baseURL: process.env.OPENAI_BASE_URL ?? ZAI_BASE_URL,
    apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
    chatModel: process.env.OPENAI_CHAT_MODEL ?? process.env.ZAI_MODEL ?? ZAI_DEFAULT_CHAT_MODEL,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? ZAI_DEFAULT_EMBEDDING_MODEL,
  };
}

/**
 * Adapter for the z.ai GLM models implementing {@link StreamingProvider}.
 * Construct via {@link createZaiProvider}; `ZaiProvider` is exposed only so the
 * existing tests can assert on the class. All work is delegated to the shared
 * OpenAI-compatible provider built in the constructor.
 */
export class ZaiProvider implements StreamingProvider {
  private readonly provider: OpenAICompatibleProvider;

  /** For tests: build from an explicit provider (skips env read). */
  constructor(provider?: OpenAICompatibleProvider) {
    this.provider = provider ?? createOpenAICompatibleProvider(readZaiConfig());
  }

  /** Stream the assistant reply as text chunks. Mock path ignores `config`. */
  chat(messages: ChatMessage[], config: ChatConfig): AsyncIterable<string> {
    return this.provider.chat(messages, config);
  }

  /** Stream the assistant reply and expose token usage as a side-channel. */
  chatWithUsage(messages: ChatMessage[], config: ChatConfig): Promise<ChatWithUsageResult> {
    return this.provider.chatWithUsage(messages, config);
  }

  /** Embed texts (live POST or deterministic mock). */
  embed(texts: string[]): Promise<number[][]> {
    return this.provider.embed(texts);
  }
}

/**
 * Construct a {@link ZaiProvider}. Reads env once at construction via
 * {@link readZaiConfig}; the factory is the seam the route handler uses so the
 * env is not read at module top-level (testable, lazy).
 */
export function createZaiProvider(): ZaiProvider {
  return new ZaiProvider();
}
