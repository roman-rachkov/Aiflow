/**
 * Multi-file Save via Gitea Contents API (shared message).
 * Trees API single-commit is preferred when added to `@/shared/gitea`; Contents
 * sequential writes are the practical fallback today.
 */
import { createOrUpdateFile } from '@/shared/gitea';

import { defaultCommitMessage, mapGiteaWriteError } from './gitea-map';
import { normalizePath } from './tree';
import type { CommitFileInput, CommitResult, EditorContext, EditorGitAuthor } from './types';

export type CommitFilesInput = {
  message?: string;
  branch?: string;
  files: CommitFileInput[];
  author: EditorGitAuthor;
};

type WriteArgs = {
  ctx: EditorContext;
  path: string;
  file: CommitFileInput;
  message: string;
  branch: string;
  identity: EditorGitAuthor;
};

/** Commit one or more files; empty `message` → SPEC template. */
export async function commitFiles(
  ctx: EditorContext,
  input: CommitFilesInput,
): Promise<CommitResult> {
  const paths: string[] = [];
  const branch = input.branch ?? ctx.giteaDefaultBranch;
  const message =
    input.message?.trim() || defaultCommitMessage(input.files.map((f) => normalizePath(f.path)));
  const identity = { name: input.author.name, email: input.author.email };

  let commitSha = '';
  for (const file of input.files) {
    const path = normalizePath(file.path);
    paths.push(path);
    commitSha = await writeOneFile({ ctx, path, file, message, branch, identity });
  }

  return { commitSha, branch, files: paths };
}

async function writeOneFile(args: WriteArgs): Promise<string> {
  try {
    const result = await createOrUpdateFile(args.ctx.giteaOwner, args.ctx.giteaRepo, args.path, {
      content: args.file.content,
      message: args.message,
      branch: args.branch,
      sha: args.file.sha,
      author: args.identity,
      committer: args.identity,
    });
    return result.commitSha;
  } catch (err) {
    mapGiteaWriteError(err, args.path);
  }
}
