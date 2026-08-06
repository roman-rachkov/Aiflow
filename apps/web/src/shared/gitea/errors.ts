/**
 * Typed upstream failure from the Gitea HTTP client.
 *
 * `status` is null for network / timeout / abort; otherwise the HTTP status.
 * Route handlers map network and 5xx (and similar) to 502; 4xx stay as-is.
 */
export class GiteaUpstreamError extends Error {
  readonly status: number | null;
  readonly body: string;

  constructor(message: string, status: number | null, body = '') {
    super(message);
    this.name = 'GiteaUpstreamError';
    this.status = status;
    this.body = body;
  }
}

/** Type guard for `GiteaUpstreamError`. */
export function isGiteaUpstreamError(err: unknown): err is GiteaUpstreamError {
  return err instanceof GiteaUpstreamError;
}
