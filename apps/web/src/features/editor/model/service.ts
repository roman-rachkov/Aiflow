/**
 * Editor domain services barrel — tree, file, commit, path, history, diff.
 * Prefer importing from `@/features/editor`; this module exists so callers can
 * also pull a single `model/service` surface in tests.
 */
export { commitFiles } from './commit';
export type { CommitFilesInput } from './commit';
export {
  BinaryFileError,
  ConflictError,
  NotFoundError,
  isBinaryFileError,
  isConflictError,
  isNotFoundError,
} from './errors';
export { getDiff, listCommits } from './history';
export type { GetDiffOptions, ListEditorCommitsOptions } from './history';
export { createPath, deletePath, renamePath } from './paths';
export type { CreatePathInput, DeletePathInput, RenamePathInput } from './paths';
export { getFileContent, listTree, normalizePath } from './tree';
export type { ListTreeOptions } from './tree';
