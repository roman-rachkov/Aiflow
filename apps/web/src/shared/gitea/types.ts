/** Author / committer identity for Contents API writes. */
export type GitIdentity = {
  name: string;
  email: string;
};

/** Input for `createRepo`. Owner comes from `GITEA_REPO_OWNER` (default aistudio). */
export type CreateRepoInput = {
  name: string;
  private?: boolean;
  defaultBranch?: string;
  description?: string;
};

/** Minimal repo metadata returned after create. */
export type RepoInfo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  owner: string;
};

/** One entry from the Git Trees API. */
export type TreeEntry = {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
};

/** Decoded file payload from the Contents API. */
export type FileContent = {
  path: string;
  content: string;
  encoding: 'utf-8';
  sha: string;
  size: number;
};

/** Contents create/update response including the new commit SHA. */
export type WriteFileResult = FileContent & {
  commitSha: string;
};

/** Contents delete response — commit that removed the path. */
export type DeleteFileResult = {
  commitSha: string;
};

/** Create or update a file via Contents API. */
export type WriteFileInput = {
  content: string;
  message: string;
  branch: string;
  sha?: string;
  author: GitIdentity;
  committer: GitIdentity;
};

/** Delete a file via Contents API. */
export type DeleteFileInput = {
  sha: string;
  message: string;
  branch: string;
  author: GitIdentity;
  committer: GitIdentity;
};

/** Options for `getTree`. */
export type GetTreeOptions = {
  ref?: string;
  recursive?: boolean;
};

/** Options for `getFile`. */
export type GetFileOptions = {
  ref?: string;
};

/** Options for `listCommits`. */
export type ListCommitsOptions = {
  ref?: string;
  page?: number;
  limit?: number;
};

/** Stable commit summary for history UI. */
export type CommitSummary = {
  sha: string;
  message: string;
  url: string;
  author: GitIdentity & { date?: string };
  committer: GitIdentity & { date?: string };
  created: string;
};

/** One file in a commit diff. */
export type CommitDiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

/** Single-commit diff payload. */
export type CommitDiff = {
  sha: string;
  message: string;
  files: CommitDiffFile[];
};

/** Authenticated user from GET /api/v1/user (owner bootstrap). */
export type AuthenticatedUser = {
  id: number;
  login: string;
  email: string;
  fullName: string;
};
