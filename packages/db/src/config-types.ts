/**
 * Typed wrappers for the `Json` config columns.
 *
 * `ModelConfig.config` and `EmbeddedAgent.config` hold values the schema
 * cannot express precisely: API keys are AES-256-GCM encrypted and stored as
 * a tagged object (`{ "__encrypted__": "<ciphertext>" }`). A bare `Json`
 * column accepts any JSON, so the invariant lives here as a branded type plus
 * a runtime guard, not in Prisma.
 *
 * The brand (`__brand`) is nominal-only — it compiles away, so the on-disk
 * shape stays a plain object and existing rows read back unchanged. The point
 * is that you cannot assign an arbitrary `Record<string, unknown>` to a column
 * expecting an `EncryptedValue` without going through the guard, which checks
 * the shape.
 *
 * See docs/03-data-model.md and the `ai-studio-internals` skill for the
 * encryption scheme; encryption itself lives in `@aiflow/crypto` (once that
 * package is real). This file owns only the value-object typing.
 */

const ENCRYPTED_TAG = '__encrypted__';

/**
 * A value that has been AES-256-GCM encrypted and must not be written as
 * plaintext. The brand makes it incompatible with a bare `Prisma.JsonValue`.
 */
export type EncryptedValue = { readonly [ENCRYPTED_TAG]: string; __brand: 'EncryptedValue' };

/**
 * The config stored on `ModelConfig.config` — provider/model settings whose
 * secret parts are encrypted. The non-secret parts (model name, base URL) are
 * free-form until `@aiflow/crypto` ships a fuller schema.
 */
export type ModelConfigValue = { readonly model: string; readonly config: EncryptedValue };

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
