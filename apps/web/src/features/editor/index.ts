/**
 * Public surface of the editor feature slice. Everything outside this slice
 * (pages, API routes) imports from here. Cross-slice feature→feature imports
 * are blocked by `boundaries/dependencies` — this barrel is the only seam.
 *
 * Pro gate reminder: pages → `requireProMode` (redirect); API/WS →
 * `assertProApiUser` (403 JSON) / WS close **4403**. Never redirect from API.
 */
export type {
  CommitFileInput,
  CommitResult,
  EditorCommitSummary,
  EditorContext,
  EditorDiff,
  EditorDiffFile,
  EditorFileContent,
  EditorGitAuthor,
  GiteaRepoIdentity,
  PathMutationResult,
  ProApiUser,
  TreeNode,
} from './model/types';
export { assertProApiUser, isBinaryContent, resolveEditorContext } from './model/access';
export {
  ensureGiteaProvisioned,
  giteaRepoNameFromProjectId,
  provisionGiteaRepo,
  resolveGiteaOwner,
} from './model/provision';
export {
  BinaryFileError,
  ConflictError,
  NotFoundError,
  isBinaryFileError,
  isConflictError,
  isNotFoundError,
} from './model/errors';
export { gateEditorRequest, gitAuthorFromSession, mapEditorError } from './model/http';
export type { EditorGateResult, EditorRouteUser } from './model/http';
export { commitFiles, getDiff, getFileContent, listCommits, listTree } from './model/service';
export { createPath, deletePath, renamePath } from './model/service';
export type {
  CommitFilesInput,
  CreatePathInput,
  DeletePathInput,
  GetDiffOptions,
  ListEditorCommitsOptions,
  ListTreeOptions,
  RenamePathInput,
} from './model/service';
export { publishEditorEvent } from './model/ws-hub';
export { publishSaved, publishTreeChanged } from './model/ws-publish';
export type { EditorClientMessage, EditorServerEvent } from './model/ws-protocol';
export { WS_CLOSE_FORBIDDEN } from './model/ws-protocol';
