/**
 * Typed wrappers for the `Json` config columns.
 *
 * `ModelConfig.config` stores the **entire** logical JSON blob as one
 * AES-256-GCM envelope (`{ "__encrypted__": "<base64>" }`). Logical plaintext
 * before encrypt (MVP Analyst):
 * `{ analyst: { provider, model, baseURL?, apiKey? } }`.
 *
 * A bare `Json` column accepts any JSON, so the invariant lives here as a
 * branded type plus a runtime guard, not in Prisma. Encryption itself lives in
 * `@aiflow/crypto`; this file owns only the value-object typing.
 *
 * See docs/03-data-model.md and the `ai-studio-internals` skill.
 */

const ENCRYPTED_TAG = '__encrypted__';

/**
 * A value that has been AES-256-GCM encrypted and must not be written as
 * plaintext. The brand makes it incompatible with a bare `Prisma.JsonValue`.
 */
export type EncryptedValue = { readonly [ENCRYPTED_TAG]: string; __brand: 'EncryptedValue' };

/**
 * On-disk shape of `ModelConfig.config`: one encrypted envelope wrapping the
 * full analyst (and future role) blob — not a nested `{ model, config }` pair.
 */
export type ModelConfigValue = EncryptedValue;

/** MVP providers accepted by ModelConfig Analyst settings. */
export type AnalystProviderId = 'openai' | 'routerai';

/**
 * Logical plaintext for the Analyst role before the whole blob is encrypted.
 * `apiKey` is omitted when the project has no stored key.
 */
export type AnalystModelConfigPlain = {
  readonly provider: AnalystProviderId;
  readonly model: string;
  readonly baseURL?: string;
  readonly apiKey?: string;
};

/**
 * The config stored on `EmbeddedAgent.config`. Less constrained than
 * ModelConfig: an embedded agent may carry prompt/template strings alongside
 * an encrypted key.
 */
export type AgentConfigValue = Readonly<Record<string, unknown>> & {
  readonly config: EncryptedValue;
};

/**
 * Runtime guard: confirms an unknown value (from `findUnique` etc.) has the
 * encrypted shape. Returns the branded type on success, throws on a shape that
 * would silently corrupt the column.
 */
export function asEncryptedValue(value: unknown): EncryptedValue {
  if (
    typeof value === 'object' &&
    value !== null &&
    ENCRYPTED_TAG in value &&
    typeof (value as Record<string, unknown>)[ENCRYPTED_TAG] === 'string'
  ) {
    return value as unknown as EncryptedValue;
  }
  throw new Error(
    `Expected { "${ENCRYPTED_TAG}": string }, got ${JSON.stringify(value).slice(0, 80)}`,
  );
}
