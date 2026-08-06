/**
 * Create / delete / rename paths in the project repo (Contents API commits).
 * Directories are materialised as `.gitkeep`. Author is always the session user.
 */
import { createOrUpdateFile, deleteFile, getFile } from '@/shared/gitea';

import { mapGiteaWriteError } from './gitea-map';
import { normalizePath } from './tree';
import type { EditorContext, EditorGitAuthor, PathMutationResult } from './types';

export type CreatePathInput = {
  path: string;
  content?: string;
  isDir?: boolean;
  author: EditorGitAuthor;
};

export type DeletePathInput = {
  path: string;
  sha: string;
  author: EditorGitAuthor;
};

export type RenamePathInput = {
  fromPath: string;
  toPath: string;
  sha: string;
  author: EditorGitAuthor;
};

/** Create a file, or a directory via `.gitkeep`. */
export async function createPath(
  ctx: EditorContext,
  input: CreatePathInput,
): Promise<PathMutationResult> {
  const target = resolveCreateTarget(input.path, input.isDir === true);
  const content = input.isDir ? '' : (input.content ?? '');
  const message = input.isDir
    ? `Create directory ${normalizePath(input.path)} via AI Studio`
    : `Create ${target} via AI Studio`;
  return writeNewPath({ ctx, path: target, content, message, author: input.author });
}

/** Delete a file blob by path + sha. */
export async function deletePath(
  ctx: EditorContext,
  input: DeletePathInput,
): Promise<PathMutationResult> {
  const path = normalizePath(input.path);
  const branch = ctx.giteaDefaultBranch;
  const identity = input.author;
  try {
    const result = await deleteFile(ctx.giteaOwner, ctx.giteaRepo, path, {
      sha: input.sha,
      message: `Delete ${path} via AI Studio`,
      branch,
      author: identity,
      committer: identity,
    });
    return { commitSha: result.commitSha, path };
  } catch (err) {
    mapGiteaWriteError(err, path);
  }
}

/**
 * Rename = create at `toPath` then delete `fromPath` (Contents fallback).
 * Prefer a single Trees commit when `@/shared/gitea` gains write-tree helpers.
 */
export async function renamePath(
  ctx: EditorContext,
  input: RenamePathInput,
): Promise<PathMutationResult> {
  const fromPath = normalizePath(input.fromPath);
  const toPath = normalizePath(input.toPath);
  const branch = ctx.giteaDefaultBranch;
  const identity = input.author;
  const source = await readForRename(ctx, fromPath);
  const message = `Rename ${fromPath} to ${toPath} via AI Studio`;

  try {
    await createOrUpdateFile(ctx.giteaOwner, ctx.giteaRepo, toPath, {
      content: source.content,
      message,
      branch,
      author: identity,
      committer: identity,
    });
    const deleted = await deleteFile(ctx.giteaOwner, ctx.giteaRepo, fromPath, {
      sha: input.sha,
      message,
      branch,
      author: identity,
      committer: identity,
    });
    return { commitSha: deleted.commitSha, path: toPath };
  } catch (err) {
    mapGiteaWriteError(err, fromPath);
  }
}

function resolveCreateTarget(path: string, isDir: boolean): string {
  const normalized = normalizePath(path);
  if (!isDir) return normalized;
  if (normalized.endsWith('/.gitkeep') || normalized.endsWith('.gitkeep')) {
    return normalized;
  }
  return `${normalized}/.gitkeep`;
}

type WriteNewPathArgs = {
  ctx: EditorContext;
  path: string;
  content: string;
  message: string;
  author: EditorGitAuthor;
};

async function writeNewPath(args: WriteNewPathArgs): Promise<PathMutationResult> {
  try {
    const result = await createOrUpdateFile(args.ctx.giteaOwner, args.ctx.giteaRepo, args.path, {
      content: args.content,
      message: args.message,
      branch: args.ctx.giteaDefaultBranch,
      author: args.author,
      committer: args.author,
    });
    return { commitSha: result.commitSha, path: args.path };
  } catch (err) {
    mapGiteaWriteError(err, args.path);
  }
}

async function readForRename(ctx: EditorContext, path: string): Promise<{ content: string }> {
  try {
    return await getFile(ctx.giteaOwner, ctx.giteaRepo, path, {
      ref: ctx.giteaDefaultBranch,
    });
  } catch (err) {
    mapGiteaWriteError(err, path);
  }
}
