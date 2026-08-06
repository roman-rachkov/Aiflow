/**
 * Master encryption key from `ENCRYPTION_KEY`.
 *
 * Policy (Task 2.3 SPEC): the env value must be exactly 32 UTF-8 bytes.
 * Wrong length or a missing value throws — callers map that to HTTP 500.
 */

const REQUIRED_BYTES = 32;

/** Read and validate `process.env.ENCRYPTION_KEY` as a 32-byte Buffer. */
export function readEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw === undefined || raw === '') {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(raw, 'utf8');
  if (key.length !== REQUIRED_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly ${String(REQUIRED_BYTES)} UTF-8 bytes, got ${String(key.length)}`,
    );
  }
  return key;
}
