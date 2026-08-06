/**
 * ModelConfig Analyst persistence: load/decrypt public DTO and upsert encrypt.
 *
 * Soft-delete: queries filter `deletedAt: null`; upsert clears `deletedAt`.
 * Never returns or logs plaintext API keys.
 */

import { encrypt, decrypt } from '@aiflow/crypto';
import { asEncryptedValue, getProjectClient } from '@aiflow/db';
import { readProviderConfigFromEnv } from '@aiflow/ai-roles';

import type {
  AnalystBlob,
  AnalystConfigPublic,
  AnalystProviderId,
  ModelConfigResponse,
  UpsertAnalystInput,
} from './types';
import { ANALYST_PROVIDERS, ROUTERAI_DEFAULT_BASE_URL } from './types';

export class ModelConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigValidationError';
  }
}

/** Public Analyst DTO + whether it came from project row or env hints. */
export async function getAnalystModelConfig(schemaName: string): Promise<ModelConfigResponse> {
  const row = await findActiveConfig(schemaName);
  if (!row) return envFallbackResponse();

  try {
    const blob = decryptBlob(row.config);
    return { analyst: toPublic(blob), source: 'project' };
  } catch {
    return envFallbackResponse();
  }
}

/**
 * Validate + encrypt the full analyst blob and upsert by `projectId`.
 * Empty/omitted `apiKey` keeps the previous key unless `clearApiKey`.
 */
export async function upsertAnalystModelConfig(
  schemaName: string,
  projectId: string,
  input: UpsertAnalystInput,
): Promise<ModelConfigResponse> {
  const provider = normalizeProvider(input.provider);
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  if (!provider) {
    throw new ModelConfigValidationError('Укажите провайдера');
  }
  if (!model) {
    throw new ModelConfigValidationError('Укажите модель');
  }

  const previous = await loadPreviousBlob(schemaName);
  const apiKey = resolveApiKey(input, previous?.analyst.apiKey);
  const baseURL = normalizeBaseURL(input.baseURL);

  const blob: AnalystBlob = {
    analyst: {
      provider,
      model,
      ...(baseURL !== undefined ? { baseURL } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
    },
  };

  const envelope = asEncryptedValue(encrypt(JSON.stringify(blob)));
  const configJson = { __encrypted__: envelope.__encrypted__ };
  const client = getProjectClient(schemaName);

  await client.modelConfig.upsert({
    where: { projectId },
    create: { projectId, config: configJson, deletedAt: null },
    update: { config: configJson, deletedAt: null },
  });

  return { analyst: toPublic(blob), source: 'project' };
}

async function findActiveConfig(schemaName: string) {
  return getProjectClient(schemaName).modelConfig.findFirst({
    where: { deletedAt: null },
  });
}

async function loadPreviousBlob(schemaName: string): Promise<AnalystBlob | null> {
  const row = await findActiveConfig(schemaName);
  if (!row) return null;
  try {
    return decryptBlob(row.config);
  } catch {
    return null;
  }
}

function decryptBlob(config: unknown): AnalystBlob {
  const envelope = asEncryptedValue(config);
  const parsed: unknown = JSON.parse(decrypt(envelope));
  if (!isAnalystBlob(parsed)) {
    throw new Error('Invalid ModelConfig blob');
  }
  return parsed;
}

function isAnalystBlob(value: unknown): value is AnalystBlob {
  if (typeof value !== 'object' || value === null) return false;
  const analyst = (value as { analyst?: unknown }).analyst;
  if (typeof analyst !== 'object' || analyst === null) return false;
  const a = analyst as Record<string, unknown>;
  return typeof a.provider === 'string' && typeof a.model === 'string';
}

function toPublic(blob: AnalystBlob): AnalystConfigPublic {
  const { provider, model, baseURL, apiKey } = blob.analyst;
  return {
    provider,
    model,
    baseURL: baseURL ?? null,
    hasApiKey: Boolean(apiKey && apiKey.length > 0),
  };
}

function envFallbackResponse(): ModelConfigResponse {
  const env = readProviderConfigFromEnv();
  return {
    analyst: {
      provider: 'openai',
      model: env.chatModel,
      baseURL: env.baseURL,
      hasApiKey: Boolean(env.apiKey && env.apiKey.length > 0),
    },
    source: 'env',
  };
}

function normalizeProvider(value: unknown): AnalystProviderId | null {
  if (typeof value !== 'string') return null;
  const id = value.trim() as AnalystProviderId;
  return ANALYST_PROVIDERS.includes(id) ? id : null;
}

function normalizeBaseURL(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveApiKey(
  input: UpsertAnalystInput,
  previous: string | undefined,
): string | undefined {
  if (input.clearApiKey) return undefined;
  const next = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  if (next.length > 0) return next;
  return previous && previous.length > 0 ? previous : undefined;
}

/** Default base URL for a provider when the project leaves it blank. */
export function defaultBaseURL(provider: AnalystProviderId): string {
  if (provider === 'routerai') return ROUTERAI_DEFAULT_BASE_URL;
  return readProviderConfigFromEnv().baseURL;
}
