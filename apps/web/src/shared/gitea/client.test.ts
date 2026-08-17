import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRepo, deleteRepo, getFile, listCommits } from './client';
import { GiteaUpstreamError, isGiteaUpstreamError } from './errors';

const BASE = 'http://gitea.test';
const TOKEN = 'test-admin-token';
const originalFetch = globalThis.fetch;

function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Narrow RequestInit.body to a string for assertions. */
function bodyAsString(body: BodyInit | null | undefined): string {
  if (typeof body === 'string') return body;
  throw new Error('expected string request body');
}

/** Narrow fetch URL arg to string. */
function urlAsString(url: RequestInfo | URL | undefined): string {
  if (typeof url === 'string') return url;
  throw new Error('expected string fetch URL');
}

beforeEach(() => {
  process.env.GITEA_URL = BASE;
  process.env.GITEA_ADMIN_TOKEN = TOKEN;
  delete process.env.GITEA_ADMIN_TOKEN_FILE;
  delete process.env.GITEA_REPO_OWNER;
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('getFile', () => {
  it('decodes base64 content and returns sha/size', async () => {
    const text = 'hello SPEC';
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonOk({
        path: 'SPEC.md',
        sha: 'abc123',
        size: text.length,
        content: b64,
        encoding: 'base64',
        type: 'file',
      }),
    );

    const file = await getFile('aistudio', 'proj', 'SPEC.md');

    expect(file).toEqual({
      path: 'SPEC.md',
      content: text,
      encoding: 'utf-8',
      sha: 'abc123',
      size: text.length,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/api/v1/repos/aistudio/proj/contents/SPEC.md`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe(`token ${TOKEN}`);
  });
});

describe('createRepo', () => {
  it('POSTs private repo with default_branch main and token auth', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonOk({
        id: 7,
        name: 'my-app',
        full_name: 'aistudio/my-app',
        private: true,
        default_branch: 'main',
        owner: { login: 'aistudio' },
      }),
    );

    const repo = await createRepo({ name: 'my-app' });

    expect(repo).toEqual({
      id: 7,
      name: 'my-app',
      fullName: 'aistudio/my-app',
      private: true,
      defaultBranch: 'main',
      owner: 'aistudio',
    });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/api/v1/admin/users/aistudio/repos`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(bodyAsString(init?.body))).toEqual({
      name: 'my-app',
      private: true,
      default_branch: 'main',
      description: '',
      auto_init: false,
    });
    expect(new Headers(init?.headers).get('Authorization')).toBe(`token ${TOKEN}`);
  });
});

describe('deleteRepo', () => {
  it('issues DELETE to the repo path', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await deleteRepo('aistudio', 'my-app');

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(url).toBe(`${BASE}/api/v1/repos/aistudio/my-app`);
    expect(init?.method).toBe('DELETE');
  });
});

describe('errors', () => {
  it('maps non-OK responses to GiteaUpstreamError', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(getFile('o', 'r', 'x')).rejects.toSatisfy((err: unknown) => {
      expect(isGiteaUpstreamError(err)).toBe(true);
      expect(err).toBeInstanceOf(GiteaUpstreamError);
      const e = err as GiteaUpstreamError;
      expect(e.status).toBe(404);
      expect(e.body).toBe('not found');
      return true;
    });
  });

  it('maps network failure to GiteaUpstreamError with null status', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('fetch failed'));

    await expect(deleteRepo('o', 'r')).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(GiteaUpstreamError);
      const e = err as GiteaUpstreamError;
      expect(e.status).toBeNull();
      expect(e.message).toBe('fetch failed');
      return true;
    });
  });
});

describe('listCommits', () => {
  it('maps Gitea JSON into the stable CommitSummary shape', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonOk([
        {
          sha: 'deadbeef',
          url: 'http://gitea.test/api/v1/repos/o/r/git/commits/deadbeef',
          created: '2026-08-01T12:00:00Z',
          commit: {
            message: 'feat: init',
            author: { name: 'A', email: 'a@x', date: '2026-08-01T12:00:00Z' },
            committer: { name: 'C', email: 'c@x' },
          },
        },
      ]),
    );

    const commits = await listCommits('o', 'r', { ref: 'main', limit: 10 });

    expect(commits).toEqual([
      {
        sha: 'deadbeef',
        message: 'feat: init',
        url: 'http://gitea.test/api/v1/repos/o/r/git/commits/deadbeef',
        author: { name: 'A', email: 'a@x', date: '2026-08-01T12:00:00Z' },
        committer: { name: 'C', email: 'c@x' },
        created: '2026-08-01T12:00:00Z',
      },
    ]);
    const href = urlAsString(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]);
    expect(href).toContain('/repos/o/r/commits?');
    expect(href).toContain('sha=main');
    expect(href).toContain('limit=10');
  });
});
