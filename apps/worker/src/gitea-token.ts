/**
 * Resolve the Gitea admin token the same way as apps/web shared/gitea:
 * `GITEA_ADMIN_TOKEN_FILE` first (compose gitea-init), then env.
 */
import { readFileSync } from 'node:fs';

export function readGiteaAdminToken(): string {
  const file = process.env.GITEA_ADMIN_TOKEN_FILE?.trim();
  if (file) {
    try {
      const fromFile = readFileSync(file, 'utf8').trim();
      if (fromFile.length > 0) return fromFile;
    } catch {
      // fall through
    }
  }
  return process.env.GITEA_ADMIN_TOKEN?.trim() ?? '';
}
