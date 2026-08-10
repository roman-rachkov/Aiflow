/**
 * Resolve Analyst chat provider from project ModelConfig or env (worker-side).
 */

import {
  createOpenAICompatibleProvider,
  createProviderFromEnv,
  readProviderConfigFromEnv,
  type ChatConfig,
  type OpenAICompatibleProvider,
} from '@aiflow/ai-roles';
import { decrypt } from '@aiflow/crypto';
import { asEncryptedValue, getProjectClient, type AnalystProviderId } from '@aiflow/db';

const ROUTERAI_DEFAULT = 'https://routerai.ru/v1';

export type ResolvedAnalystProvider = {
  provider: OpenAICompatibleProvider;
  chatConfig: Pick<ChatConfig, 'model' | 'apiKey'>;
  source: 'project' | 'env';
};

type AnalystBlob = {
  analyst: {
    provider: AnalystProviderId;
    model: string;
    baseURL?: string;
    apiKey?: string;
  };
};

/** Load project Analyst settings and build a chat provider (env fallback). */
export async function resolveAnalystProvider(schemaName: string): Promise<ResolvedAnalystProvider> {
  const blob = await tryLoadAnalystBlob(schemaName);
  const key = blob?.analyst.apiKey?.trim();
  if (blob && key) return fromProjectBlob(blob, key);
  return fromEnv();
}

async function tryLoadAnalystBlob(schemaName: string): Promise<AnalystBlob | null> {
  const row = await getProjectClient(schemaName).modelConfig.findFirst({
    where: { deletedAt: null },
  });
  if (!row) return null;
  try {
    const parsed: unknown = JSON.parse(decrypt(asEncryptedValue(row.config)));
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
  const providerId = blob.analyst.provider;
  const baseURL =
    blob.analyst.baseURL?.trim() ||
    (providerId === 'routerai' ? ROUTERAI_DEFAULT : 'https://api.openai.com/v1');
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
