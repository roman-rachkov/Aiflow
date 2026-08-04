import { describe, expect, it } from 'vitest';

import { asEncryptedValue } from './config-types';

/**
 * The Json config columns accept any JSON at the Prisma level, so the shape
 * invariant lives in `asEncryptedValue`. These tests pin that invariant: a
 * well-formed encrypted value passes, and anything else throws before it can
 * reach the column.
 */
describe('asEncryptedValue', () => {
  it('passes a well-formed encrypted value through', () => {
    const value = { __encrypted__: 'ciphertext-bytes' };
    expect(asEncryptedValue(value)).toEqual({ __encrypted__: 'ciphertext-bytes' });
  });

  it('throws on a missing __encrypted__ tag', () => {
    expect(() => asEncryptedValue({ key: 'plaintext-leak' })).toThrow();
  });

  it('throws when __encrypted__ is not a string', () => {
    expect(() => asEncryptedValue({ __encrypted__: 123 })).toThrow();
  });

  it.each([[null], [undefined], ['a-string'], [42], [[]]])('throws on %s', (input) => {
    expect(() => asEncryptedValue(input)).toThrow();
  });
});
