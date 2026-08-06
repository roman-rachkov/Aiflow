/**
 * `@aiflow/crypto` — AES-256-GCM leaf helpers (Node builtins only).
 *
 * Consumers wrap results with `asEncryptedValue` from `@aiflow/db`. This
 * package must not depend on Prisma or `@aiflow/db`.
 */

export { encrypt, decrypt, type EncryptedEnvelope } from './encrypt';
export { readEncryptionKey } from './key';
