/**
 * Public surface of the model-config feature slice (Task 2.3).
 * UI lives in `./client` so this barrel stays server-safe.
 */

export type {
  AnalystConfigPublic,
  AnalystProviderId,
  ModelConfigResponse,
  UpsertAnalystInput,
} from './model/types';
export { ANALYST_PROVIDERS, ROUTERAI_DEFAULT_BASE_URL } from './model/types';
export {
  getAnalystModelConfig,
  upsertAnalystModelConfig,
  defaultBaseURL,
  ModelConfigValidationError,
} from './model/service';
export { resolveAnalystProvider } from './model/resolve-provider';
export type { ResolvedAnalystProvider } from './model/resolve-provider';
export { assertProModelConfig, isEncryptionKeyError } from './model/access';
export type { ProApiUser } from './model/access';
