import { describe, expect, it } from 'vitest';

import { DEFAULT_ALLOWED_HOSTS, isHostAllowed, parseAllowedHosts } from './allowlist';

describe('parseAllowedHosts', () => {
  it('returns defaults when env is empty', () => {
    expect(parseAllowedHosts(undefined)).toEqual(DEFAULT_ALLOWED_HOSTS);
    expect(parseAllowedHosts('')).toEqual(DEFAULT_ALLOWED_HOSTS);
    expect(parseAllowedHosts('  ')).toEqual(DEFAULT_ALLOWED_HOSTS);
  });

  it('parses comma-separated hosts', () => {
    expect(parseAllowedHosts('Example.COM, foo.org ')).toEqual(['example.com', 'foo.org']);
  });
});

describe('isHostAllowed', () => {
  const allowed = parseAllowedHosts('registry.npmjs.org,github.com');

  it('allows exact hosts', () => {
    expect(isHostAllowed('registry.npmjs.org', allowed)).toBe(true);
    expect(isHostAllowed('GitHub.com', allowed)).toBe(true);
  });

  it('strips port from host', () => {
    expect(isHostAllowed('github.com:443', allowed)).toBe(true);
  });

  it('denies unknown hosts', () => {
    expect(isHostAllowed('evil.example', allowed)).toBe(false);
    expect(isHostAllowed('npmjs.org', allowed)).toBe(false);
  });
});
