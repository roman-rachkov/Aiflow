/**
 * Resolve the Analyst LLM provider for chat / SPEC generation.
 *
 * When the project ModelConfig has an apiKey, use that (OpenAI-compatible).
 * Otherwise fall back to `createProviderFromEnv`. Embeddings stay on env —
 * callers that need embed must keep using the env factory separately.
 */

import {
  createOpenAICompatibleProvider,
  createProviderFromEnv,
  readProviderConfigFromEnv,
} from '@aiflow/ai-roles';
import type { ChatConfig, OpenAICompatibleProvider } from '@aiflow/ai-roles';
import { decrypt } from '@aiflow/crypto';
import { asEncryptedValue, getProjectClient } from '@aiflow/db';

import { defaultBaseURL } from './service';
import type { AnalystBlob, AnalystProviderId } from './types';

export type ResolvedAnalystProvider = {
  provider: OpenAICompatibleProvider;
  chatConfig: Pick<ChatConfig, 'model' | 'apiKey'>;
  source: 'project' | 'env';
};

/** Load project Analyst settings and build a chat provider (env fallback). */
export async function resolveAnalystProvider(schemaName: string): Promise<ResolvedAnalystProvider> {
  const blob = await tryLoadAnalystBlob(schemaName);
  const key = blob?.analyst.apiKey?.trim();
  if (blob && key) {
    return fromProjectBlob(blob, key);
  }
  return fromEnv();
}

async function tryLoadAnalystBlob(schemaName: string): Promise<AnalystBlob | null> {
  const row = await getProjectClient(schemaName).modelConfig.findFirst({
    where: { deletedAt: null },
  });
  if (!row) return null;
  try {
    const envelope = asEncryptedValue(row.config);
    const parsed: unknown = JSON.parse(decrypt(envelope));
    if (!isAnalystBlob(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isAnalystBlob(value: unknown): value is AnalystBlob {
  if (typeof value !== 'object' || value === null) return false;
  const analyst = (value as { analyst?: unknown }).analyst;
  if (typeof analyst !== 'object' || analyst === null) return false;
  const a = analyst as Record<string, unknown>;
  return typeof a.provider === 'string' && typeof a.model === 'string';
}

function fromProjectBlob(blob: AnalystBlob, apiKey: string): ResolvedAnalystProvider {
  const env = readProviderConfigFromEnv();
  const providerId: AnalystProviderId = blob.analyst.provider;
  const baseURL = blob.analyst.baseURL?.trim() || defaultBaseURL(providerId);
  return {
    provider: createOpenAICompatibleProvider({
      baseURL,
      apiKey,
      chatModel: blob.analyst.model,
      embeddingModel: env.embeddingModel,
    }),
    chatConfig: { model: blob.analyst.model, apiKey },
    source: 'project',
  };
}

function fromEnv(): ResolvedAnalystProvider {
  const env = readProviderConfigFromEnv();
  return {
    provider: createProviderFromEnv(),
    chatConfig: { model: env.chatModel, apiKey: env.apiKey },
    source: 'env',
  };
}
