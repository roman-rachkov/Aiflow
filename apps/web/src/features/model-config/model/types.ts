/**
 * Types for the ModelConfig Analyst feature (Task 2.3).
 */

import type { AnalystProviderId } from '@aiflow/db';

export type { AnalystProviderId };

/** Public GET/PUT response for Analyst settings — never includes plaintext key. */
export type AnalystConfigPublic = {
  provider: AnalystProviderId;
  model: string;
  baseURL: string | null;
  hasApiKey: boolean;
};

export type ModelConfigResponse = {
  analyst: AnalystConfigPublic;
  source: 'project' | 'env';
};

/** Body for PUT /model-config (and upsertAnalystModelConfig). */
export type UpsertAnalystInput = {
  provider: AnalystProviderId;
  model: string;
  baseURL?: string | null;
  apiKey?: string | null;
  clearApiKey?: boolean;
};

/** Logical plaintext stored inside the encrypted ModelConfig blob. */
export type AnalystBlob = {
  analyst: {
    provider: AnalystProviderId;
    model: string;
    baseURL?: string;
    apiKey?: string;
  };
};

export const ANALYST_PROVIDERS: readonly AnalystProviderId[] = ['openai', 'routerai'];

/** Default OpenAI-compatible base URL when provider is routerai and none set. */
export const ROUTERAI_DEFAULT_BASE_URL = 'https://routerai.ru/v1';
