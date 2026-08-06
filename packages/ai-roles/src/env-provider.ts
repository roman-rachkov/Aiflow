/**
 * Env-driven factory over the universal OpenAI-compatible provider.
 *
 * One adapter for every OpenAI-shaped backend (z.ai, OpenAI, LM Studio,
 * Ollama, …). Point `OPENAI_BASE_URL` / `OPENAI_API_KEY` / model ids at the
 * host you want; no per-vendor package. Defaults keep the historical z.ai
 * endpoint so existing deploys without env keep working.
 *
 * Reads env ONCE inside the factory (not at module top-level) so it stays
 * testable. MOCK when the key is absent/empty; LIVE otherwise.
 */

import type { OpenAICompatibleProvider, ProviderConfig } from './types';
import { createOpenAICompatibleProvider } from './openai-compatible';

/** Fallback when `OPENAI_BASE_URL` is unset (historical z.ai default). */
const DEFAULT_BASE_URL = 'https://api.z.ai/api/paas/v4';

/** Fallback chat model id. */
const DEFAULT_CHAT_MODEL = 'glm-4.6';

/** Fallback embedding model id (override via OPENAI_EMBEDDING_MODEL). */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Resolve {@link ProviderConfig} from process env. Called lazily inside the
 * factory — never at module load — so tests can set env before construction.
 *
 * Aliases kept for back-compat: `ZAI_API_KEY` ≡ `OPENAI_API_KEY`,
 * `ZAI_MODEL` ≡ `OPENAI_CHAT_MODEL`.
 */
export function readProviderConfigFromEnv(): ProviderConfig {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.ZAI_API_KEY;
  return {
    baseURL: process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL,
    apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
    chatModel: process.env.OPENAI_CHAT_MODEL ?? process.env.ZAI_MODEL ?? DEFAULT_CHAT_MODEL,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  };
}

/**
 * The seam the app uses: one OpenAI-compatible provider configured from env.
 * LM Studio, z.ai, OpenAI — same call; only the env values change.
 */
export function createProviderFromEnv(): OpenAICompatibleProvider {
  return createOpenAICompatibleProvider(readProviderConfigFromEnv());
}

/**
 * @deprecated Prefer {@link createProviderFromEnv}. Kept so older Task 1.3
 * call sites and mocks that still import this name keep compiling.
 */
export function createZaiProvider(): OpenAICompatibleProvider {
  return createProviderFromEnv();
}
