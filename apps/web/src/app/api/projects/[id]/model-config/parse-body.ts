import { ANALYST_PROVIDERS } from '@/features/model-config';
import type { AnalystProviderId, UpsertAnalystInput } from '@/features/model-config';

/** Parse and validate PUT /model-config JSON body. Throws Error with Russian message. */
export function parsePutBody(raw: unknown): UpsertAnalystInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Некорректное тело запроса');
  }
  const body = raw as Record<string, unknown>;
  const analyst = body.analyst;
  if (typeof analyst !== 'object' || analyst === null) {
    throw new Error('Укажите блок analyst');
  }
  const a = analyst as Record<string, unknown>;
  const provider = parseProvider(a.provider);
  if (!provider) {
    throw new Error('Укажите провайдера openai или routerai');
  }
  if (typeof a.model !== 'string') {
    throw new Error('Укажите модель');
  }
  return {
    provider,
    model: a.model,
    baseURL: optionalStringOrNull(a.baseURL),
    apiKey: optionalStringOrNull(a.apiKey),
    clearApiKey: body.clearApiKey === true,
  };
}

function parseProvider(value: unknown): AnalystProviderId | null {
  if (typeof value !== 'string') return null;
  return ANALYST_PROVIDERS.includes(value as AnalystProviderId)
    ? (value as AnalystProviderId)
    : null;
}

function optionalStringOrNull(value: unknown): string | null | undefined {
  if (typeof value === 'string' || value === null) return value;
  return undefined;
}
