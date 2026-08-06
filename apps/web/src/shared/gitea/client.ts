/**
 * Gitea REST API v1 operations (Contents / Git Trees / commits).
 * Prefer Contents + Git Trees under `/api/v1/repos/...`. Empty dirs: callers
 * write a `.gitkeep` (Gitea does not store empty directories).
 */
import { encodeRepoPath, getRepoOwner, requestJson, requestVoid } from './http';
import type {
  AuthenticatedUser,
  CreateRepoInput,
  DeleteFileInput,
  FileContent,
  GetFileOptions,
  GetTreeOptions,
  GitIdentity,
  RepoInfo,
  TreeEntry,
  WriteFileInput,
} from './types';

export { getCommitDiff, listCommits } from './commits';

type RawUser = { id: number; login: string; email?: string; full_name?: string };
type RawRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
};
type RawTree = {
  tree?: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
  }>;
};
type RawContent = {
  path: string;
  sha: string;
  size: number;
  content?: string | null;
  encoding?: string;
  type: string;
};

/** GET /api/v1/user — token owner (bootstrap when GITEA_REPO_OWNER unset). */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  const raw = await requestJson<RawUser>('/user');
  return {
    id: raw.id,
    login: raw.login,
    email: raw.email ?? '',
    fullName: raw.full_name ?? '',
  };
}

/** Create a private-by-default repo under `GITEA_REPO_OWNER` (admin API). */
export async function createRepo(input: CreateRepoInput): Promise<RepoInfo> {
  const owner = getRepoOwner();
  const body = {
    name: input.name,
    private: input.private ?? true,
    default_branch: input.defaultBranch ?? 'main',
    description: input.description ?? '',
    auto_init: false,
  };
  const raw = await requestJson<RawRepo>(`/admin/users/${encodeURIComponent(owner)}/repos`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    private: raw.private,
    defaultBranch: raw.default_branch,
    owner: raw.owner.login,
  };
}

/** DELETE /repos/{owner}/{repo} — compensation / teardown. */
export async function deleteRepo(owner: string, repo: string): Promise<void> {
  await requestVoid(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    method: 'DELETE',
  });
}

/** GET git/trees/{ref} — file tree (recursive when requested). */
export async function getTree(
  owner: string,
  repo: string,
  options: GetTreeOptions = {},
): Promise<TreeEntry[]> {
  const ref = options.ref ?? 'main';
  const qs = options.recursive ? '?recursive=true' : '';
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await requestJson<RawTree>(`${base}/git/trees/${encodeURIComponent(ref)}${qs}`);
  return (raw.tree ?? []).map((e) => ({
    path: e.path,
    mode: e.mode,
    type: e.type as TreeEntry['type'],
    sha: e.sha,
    size: e.size,
  }));
}

/** GET contents/{path} — decode base64 body to utf-8. */
export async function getFile(
  owner: string,
  repo: string,
  path: string,
  options: GetFileOptions = {},
): Promise<FileContent> {
  const qs = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : '';
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await requestJson<RawContent>(`${base}/contents/${encodeRepoPath(path)}${qs}`);
  return {
    path: raw.path,
    content: decodeContent(raw.content, raw.encoding),
    encoding: 'utf-8',
    sha: raw.sha,
    size: raw.size,
  };
}

/** POST contents/{path} — create or update (pass `sha` to update). */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  input: WriteFileInput,
): Promise<FileContent> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const body = {
    content: Buffer.from(input.content, 'utf8').toString('base64'),
    message: input.message,
    branch: input.branch,
    ...(input.sha ? { sha: input.sha } : {}),
    author: identity(input.author),
    committer: identity(input.committer),
  };
  const raw = await requestJson<{ content: RawContent }>(
    `${base}/contents/${encodeRepoPath(path)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  const c = raw.content;
  return {
    path: c.path,
    content: input.content,
    encoding: 'utf-8',
    sha: c.sha,
    size: c.size,
  };
}

/** DELETE contents/{path} — requires current blob `sha`. */
export async function deleteFile(
  owner: string,
  repo: string,
  path: string,
  input: DeleteFileInput,
): Promise<void> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const body = {
    sha: input.sha,
    message: input.message,
    branch: input.branch,
    author: identity(input.author),
    committer: identity(input.committer),
  };
  await requestVoid(`${base}/contents/${encodeRepoPath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

function identity(id: GitIdentity): { name: string; email: string } {
  return { name: id.name, email: id.email };
}

function decodeContent(content: string | null | undefined, encoding?: string): string {
  if (content == null || content === '') return '';
  if (encoding === 'base64' || encoding == null) {
    return Buffer.from(content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return content;
}
