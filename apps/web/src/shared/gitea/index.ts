/**
 * Gitea shared HTTP client barrel — the only public surface of this slice.
 *
 * Talks to Gitea REST API v1 (`/api/v1/...`), preferring Contents and Git Trees
 * under `/api/v1/repos/{owner}/{repo}/...`. Empty directories are not stored by
 * Git; callers that need a folder write a `.gitkeep`.
 *
 * License: MIT / no new dependency — uses the platform `fetch` only. A `ws`
 * (WebSocket) client, if required later, is a separate task.
 *
 * Env (read on first use, not at module load): `GITEA_URL`, admin token via
 * `GITEA_ADMIN_TOKEN_FILE` (compose gitea-init) or `GITEA_ADMIN_TOKEN`,
 * optional `GITEA_REPO_OWNER` (default `aistudio`). Auth:
 * `Authorization: token …`. ~15s timeout; network and non-2xx failures surface
 * as `GiteaUpstreamError` (routes map upstream to 502).
 *
 * Deep imports from internals are blocked by `import/no-internal-modules`;
 * consumers must use this barrel.
 */
export {
  createRepo,
  deleteRepo,
  getTree,
  getFile,
  createOrUpdateFile,
  deleteFile,
  listCommits,
  getCommitDiff,
  getAuthenticatedUser,
} from './client';
export { GiteaUpstreamError, isGiteaUpstreamError } from './errors';
export type {
  AuthenticatedUser,
  CommitDiff,
  CommitDiffFile,
  CommitSummary,
  CreateRepoInput,
  DeleteFileInput,
  DeleteFileResult,
  FileContent,
  GetFileOptions,
  GetTreeOptions,
  GitIdentity,
  ListCommitsOptions,
  RepoInfo,
  TreeEntry,
  WriteFileInput,
  WriteFileResult,
} from './types';
