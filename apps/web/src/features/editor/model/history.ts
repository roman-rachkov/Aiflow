/**
 * Commit history and single-commit diffs for the editor Git panel.
 */
import {
  getCommitDiff,
  listCommits as listGiteaCommits,
  type CommitDiffFile,
} from '@/shared/gitea';

import type { EditorCommitSummary, EditorContext, EditorDiff, EditorDiffFile } from './types';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export type ListEditorCommitsOptions = {
  ref?: string;
  page?: number;
  limit?: number;
};

export type GetDiffOptions = {
  sha: string;
  path?: string;
};

/** Paginated history; `limit` capped at 50. */
export async function listCommits(
  ctx: EditorContext,
  options: ListEditorCommitsOptions = {},
): Promise<EditorCommitSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const raw = await listGiteaCommits(ctx.giteaOwner, ctx.giteaRepo, {
    ref: options.ref ?? ctx.giteaDefaultBranch,
    page: options.page,
    limit,
  });
  return raw.map((c) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    message: c.message,
    authorName: c.author.name,
    authorEmail: c.author.email,
    committedAt: c.committer.date ?? c.author.date ?? c.created,
    url: c.url,
  }));
}

/** Single-commit diff; optional `path` filters to one file. */
export async function getDiff(ctx: EditorContext, options: GetDiffOptions): Promise<EditorDiff> {
  const diff = await getCommitDiff(ctx.giteaOwner, ctx.giteaRepo, options.sha);
  const files = diff.files.map(mapDiffFile).filter((f) => matchesPathFilter(f, options.path));
  return { sha: diff.sha, files };
}

function mapDiffFile(file: CommitDiffFile): EditorDiffFile {
  return {
    path: file.filename,
    status: mapDiffStatus(file.status),
    patch: file.patch ?? '',
  };
}

function mapDiffStatus(status: string): EditorDiffFile['status'] {
  if (status === 'added' || status === 'created') return 'added';
  if (status === 'removed' || status === 'deleted') return 'deleted';
  if (status === 'renamed' || status === 'copied') return 'renamed';
  return 'modified';
}

function matchesPathFilter(file: EditorDiffFile, path?: string): boolean {
  if (!path) return true;
  return file.path === path || file.path.endsWith(`/${path}`);
}
