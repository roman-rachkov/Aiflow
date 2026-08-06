/**
 * Low-level Gitea HTTP helpers: env, auth, timeout, JSON request.
 * Env is read on first use (not at module load).
 */
import { GiteaUpstreamError } from './errors';

const TIMEOUT_MS = 15_000;
const DEFAULT_OWNER = 'aistudio';

type GiteaConfig = { baseUrl: string; token: string };

/** Strip trailing slash from GITEA_URL. */
function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

/** Read GITEA_URL + GITEA_ADMIN_TOKEN. Throws if either is missing. */
export function getConfig(): GiteaConfig {
  const baseUrl = normalizeBaseUrl(process.env.GITEA_URL ?? '');
  if (!baseUrl) throw new Error('GITEA_URL is not set');
  const token = process.env.GITEA_ADMIN_TOKEN ?? '';
  if (!token) throw new Error('GITEA_ADMIN_TOKEN is not set');
  return { baseUrl, token };
}

/** Repo owner from GITEA_REPO_OWNER, default `aistudio`. */
export function getRepoOwner(): string {
  const fromEnv = process.env.GITEA_REPO_OWNER?.trim();
  return fromEnv || DEFAULT_OWNER;
}

/** Encode a repo-relative path for Contents URLs (keep `/` separators). */
export function encodeRepoPath(path: string): string {
  return path
    .split('/')
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

/** Build auth + JSON headers without spreading HeadersInit (may be a list). */
function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  const { token } = getConfig();
  headers.set('Authorization', `token ${token}`);
  headers.set('Accept', 'application/json');
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

/**
 * fetch against `/api/v1{path}` with token auth and ~15s timeout.
 * Network / abort failures become `GiteaUpstreamError` (status null).
 */
export async function giteaFetch(path: string, init?: RequestInit): Promise<Response> {
  const { baseUrl } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: buildHeaders(init),
    });
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? `Gitea request timed out after ${String(TIMEOUT_MS)}ms: ${path}`
        : err instanceof Error
          ? err.message
          : 'Gitea request failed';
    throw new GiteaUpstreamError(message, null);
  } finally {
    clearTimeout(timer);
  }
}

/** JSON request; non-2xx → `GiteaUpstreamError` with status + body. */
export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await giteaFetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GiteaUpstreamError(`Gitea ${String(res.status)} for ${path}`, res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Like `requestJson` but tolerates empty body on 2xx. */
export async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await giteaFetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GiteaUpstreamError(`Gitea ${String(res.status)} for ${path}`, res.status, body);
  }
}
