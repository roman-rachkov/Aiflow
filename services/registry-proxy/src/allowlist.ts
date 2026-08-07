/**
 * Host allowlist for sandbox egress via registry-proxy.
 */

export const DEFAULT_ALLOWED_HOSTS = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'pypi.org',
  'github.com',
  'objects.githubusercontent.com',
  'nodejs.org',
  'cdn.jsdelivr.net',
];

/** Parse comma-separated ALLOWED_HOSTS (empty → defaults). */
export function parseAllowedHosts(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return [...DEFAULT_ALLOWED_HOSTS];
  }
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Exact host match (case-insensitive). No subdomain wildcards. */
export function isHostAllowed(host: string, allowed: readonly string[]): boolean {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '');
  const withoutPort = normalized.includes(':')
    ? (normalized.split(':')[0] ?? normalized)
    : normalized;
  return allowed.includes(withoutPort);
}
