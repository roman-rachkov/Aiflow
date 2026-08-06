/**
 * Editor domain types. Gitea identity is always filled on `EditorContext` —
 * `resolveEditorContext` lazy-provisions when ProjectMeta still has nulls.
 */

/** Resolved project + Gitea identity for editor services and routes. */
export type EditorContext = {
  id: string;
  name: string;
  schemaName: string;
  ownerId: string;
  giteaOwner: string;
  giteaRepo: string;
  giteaDefaultBranch: string;
};

/**
 * Minimal session shape for the API Pro gate. Avoids importing `@/features/auth`
 * (FSD forbids feature→feature). Routes pass the user from `requireUser()`.
 */
export type ProApiUser = {
  uiMode: 'BASIC' | 'PRO';
};

/** Gitea repo identity written back onto ProjectMeta after provision. */
export type GiteaRepoIdentity = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

/** Author/committer for editor commits — always the session user. */
export type EditorGitAuthor = {
  name: string;
  email: string;
};

/** One node in the editor file tree. */
export type TreeNode = {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
};

/** Text file payload for Monaco (utf-8 only). */
export type EditorFileContent = {
  path: string;
  content: string;
  encoding: 'utf-8';
  sha: string;
  size: number;
};

/** One dirty/new file in a Save commit. */
export type CommitFileInput = {
  path: string;
  content: string;
  sha?: string;
};

/** Result of commitFiles / path mutations that create a Git commit. */
export type CommitResult = {
  commitSha: string;
  branch: string;
  files: string[];
};

/** Result of create / delete / rename path. */
export type PathMutationResult = {
  commitSha: string;
  path: string;
};

/** Stable commit row for the Git history panel. */
export type EditorCommitSummary = {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  url?: string;
};

/** One file in a commit diff (Monaco DiffEditor). */
export type EditorDiffFile = {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch: string;
  oldPath?: string;
};

/** Single-commit diff for the Git panel. */
export type EditorDiff = {
  sha: string;
  files: EditorDiffFile[];
};
