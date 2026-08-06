import { afterEach, describe, expect, it } from 'vitest';

import { decrypt, encrypt, readEncryptionKey } from './index';

const FIXED_KEY = '0123456789abcdef0123456789abcdef'; // 32 chars

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('readEncryptionKey', () => {
  it('accepts a 32-byte UTF-8 key', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    expect(readEncryptionKey()).toEqual(Buffer.from(FIXED_KEY, 'utf8'));
  });

  it('rejects a missing key', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => readEncryptionKey()).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it('rejects a truncated key', () => {
    process.env.ENCRYPTION_KEY = 'too-short';
    expect(() => readEncryptionKey()).toThrow(/exactly 32 UTF-8 bytes/);
  });

  it('rejects a too-long key', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY + 'x';
    expect(() => readEncryptionKey()).toThrow(/exactly 32 UTF-8 bytes/);
  });
});

describe('encrypt / decrypt', () => {
  it('round-trips plaintext', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    const envelope = encrypt('hello secret');
    expect(envelope).toHaveProperty('__encrypted__');
    expect(typeof envelope.__encrypted__).toBe('string');
    expect(decrypt(envelope)).toBe('hello secret');
  });

  it('fails decrypt with the wrong key', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    const envelope = encrypt('payload');
    const other = Buffer.from('abcdefghijklmnopqrstuvwxyz012345', 'utf8');
    expect(() => decrypt(envelope, other)).toThrow();
  });

  it('rejects a malformed envelope (missing tag)', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    expect(() => decrypt({ __encrypted__: undefined as unknown as string })).toThrow(
      /Malformed encrypted envelope/,
    );
  });

  it('rejects a short / truncated payload', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    expect(() => decrypt({ __encrypted__: Buffer.from('short').toString('base64') })).toThrow(
      /too short/,
    );
  });

  it('rejects garbage that decodes to an empty buffer', () => {
    process.env.ENCRYPTION_KEY = FIXED_KEY;
    expect(() => decrypt({ __encrypted__: '!!!' })).toThrow(/too short/);
  });
});
