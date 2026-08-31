/**
 * Support Bot runtime service.
 *
 * Combines RAG retrieval with the project's AI provider to answer user
 * questions about their application.
 *
 * `features/support-bot` cannot import `@/features/files` directly — the
 * `boundaries/dependencies` ESLint rule blocks cross-slice feature→feature
 * imports (see eslint.config.mjs). The RAG functions are injected by the
 * API route (which lives in `app/` and may wire slices together).
 *
 * Never throws: embed/retrieval failures degrade to chat-without-RAG.
 */
import { createProviderFromEnv, readProviderConfigFromEnv } from '@aiflow/ai-roles';
import type { ChatMessage } from '@aiflow/ai-roles';

import { buildSupportSystemPrompt } from './prompt';

/** Minimal shape of a retrieved chunk — structurally identical to `RetrievedChunk`. */
export interface RetrievedChunkLike {
  id: string;
  content: string;
  distance: number;
  path: string;
}

/** Functions injected by the route so this slice stays free of cross-slice imports. */
export interface SupportBotDeps {
  /** Top-k RAG retrieval. Never throws — returns `[]` on provider failure. */
  retrieveChunks: (schemaName: string, query: string, k?: number) => Promise<RetrievedChunkLike[]>;
}

/**
 * Stream a support bot answer for `message` using RAG context from the project
 * schema. Returns `{ stream, sources }` where `sources` is a deduplicated list
 * of document paths retrieved (for client-side citation).
 */
export async function streamSupportAnswer(
  schemaName: string,
  message: string,
  deps: SupportBotDeps,
): Promise<{ stream: AsyncIterable<string>; sources: string[] }> {
  const chunks = await deps.retrieveChunks(schemaName, message, 5).catch(() => []);
  const sources = [...new Set(chunks.map((c) => c.path))];

  const contextText =
    chunks.length > 0
      ? `Context from project documents:\n\n${chunks
          .map((c, i) => `[Fragment ${String(i + 1)} — ${c.path}]\n${c.content}`)
          .join('\n\n')}`
      : '';

  const systemPrompt = buildSupportSystemPrompt(contextText);
  const providerConfig = readProviderConfigFromEnv();
  const provider = createProviderFromEnv();

  const messages: ChatMessage[] = [
    { role: 'SYSTEM', content: systemPrompt },
    { role: 'USER', content: message },
  ];

  const stream = provider.chat(messages, {
    model: providerConfig.chatModel,
    systemPrompt,
  });

  return { stream, sources };
}
