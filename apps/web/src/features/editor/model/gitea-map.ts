/**
 * Map Gitea upstream failures onto editor domain errors (conflict / not found).
 */
import { isGiteaUpstreamError } from '@/shared/gitea';

import { ConflictError, NotFoundError } from './errors';

/** Re-throw ConflictError / NotFoundError when Gitea status matches; else rethrow. */
export function mapGiteaWriteError(err: unknown, path?: string): never {
  if (isGiteaUpstreamError(err)) {
    if (err.status === 409 || err.status === 422) {
      throw new ConflictError(`SHA conflict${path ? `: ${path}` : ''}`, path);
    }
    if (err.status === 404) {
      throw new NotFoundError(path ? `Path not found: ${path}` : 'Not found');
    }
  }
  throw err;
}

/** Empty-message template from SPEC: `Update {paths} via AI Studio`. */
export function defaultCommitMessage(paths: string[]): string {
  return `Update ${paths.join(', ')} via AI Studio`;
}
