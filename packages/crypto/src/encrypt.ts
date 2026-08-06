/**
 * AES-256-GCM encrypt / decrypt for secret envelopes.
 *
 * Envelope: `{ __encrypted__: string }` where the string is Base64 of
 * `iv(12) || authTag(16) || ciphertext`. The brand-compatible shape matches
 * `EncryptedValue` in `@aiflow/db`; this package stays Prisma-free.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { readEncryptionKey } from './key';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** On-disk / wire shape for an AES-256-GCM ciphertext blob. */
export type EncryptedEnvelope = { readonly __encrypted__: string };

/**
 * Encrypt plaintext under AES-256-GCM.
 * @param plaintext - UTF-8 string to protect
 * @param key - optional 32-byte key; defaults to {@link readEncryptionKey}
 */
export function encrypt(plaintext: string, key?: Buffer): EncryptedEnvelope {
  const k = key ?? readEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, k, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return { __encrypted__: packed.toString('base64') };
}

/**
 * Decrypt an {@link EncryptedEnvelope} produced by {@link encrypt}.
 * Throws on wrong key, truncated payload, or bad Base64.
 */
export function decrypt(envelope: EncryptedEnvelope, key?: Buffer): string {
  const k = key ?? readEncryptionKey();
  if (typeof envelope.__encrypted__ !== 'string') {
    throw new Error('Malformed encrypted envelope: missing __encrypted__ string');
  }
  let packed: Buffer;
  try {
    packed = Buffer.from(envelope.__encrypted__, 'base64');
  } catch {
    throw new Error('Malformed encrypted envelope: invalid Base64');
  }
  // Node Buffer.from(base64) does not throw on garbage; detect empty/short.
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Malformed encrypted envelope: payload too short');
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
