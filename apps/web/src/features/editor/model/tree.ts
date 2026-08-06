/**
 * Editor read helpers: file tree listing and file content for Monaco.
 */
import { getFile, getTree, isGiteaUpstreamError, type TreeEntry } from '@/shared/gitea';

import { isBinaryContent } from './access';
import { BinaryFileError, NotFoundError } from './errors';
import type { EditorContext, EditorFileContent, TreeNode } from './types';

export type ListTreeOptions = {
  ref?: string;
  path?: string;
};

/** List direct children of `path` (root when omitted), dirs then files by name. */
export async function listTree(
  ctx: EditorContext,
  options: ListTreeOptions = {},
): Promise<TreeNode[]> {
  const ref = options.ref ?? ctx.giteaDefaultBranch;
  const prefix = normalizePath(options.path ?? '');
  const entries = await getTree(ctx.giteaOwner, ctx.giteaRepo, { ref, recursive: true });
  return sortTreeNodes(toDirectChildren(entries, prefix));
}

/** Load utf-8 file content; throws NotFoundError / BinaryFileError. */
export async function getFileContent(
  ctx: EditorContext,
  path: string,
  ref?: string,
): Promise<EditorFileContent> {
  const filePath = normalizePath(path);
  try {
    const file = await getFile(ctx.giteaOwner, ctx.giteaRepo, filePath, {
      ref: ref ?? ctx.giteaDefaultBranch,
    });
    if (isBinaryContent(file.content)) throw new BinaryFileError(filePath);
    return {
      path: file.path,
      content: file.content,
      encoding: 'utf-8',
      sha: file.sha,
      size: file.size,
    };
  } catch (err) {
    if (err instanceof BinaryFileError) throw err;
    if (isGiteaUpstreamError(err) && err.status === 404) {
      throw new NotFoundError(`File not found: ${filePath}`);
    }
    throw err;
  }
}

/** Strip leading/trailing slashes from a repo-relative path. */
export function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function toDirectChildren(entries: TreeEntry[], prefix: string): TreeNode[] {
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const node = asDirectChild(entry, prefix);
    if (node) nodes.push(node);
  }
  return nodes;
}

function asDirectChild(entry: TreeEntry, prefix: string): TreeNode | null {
  if (entry.type !== 'blob' && entry.type !== 'tree') return null;
  const relative = relativeUnderPrefix(entry.path, prefix);
  if (relative == null || relative.includes('/')) return null;
  return {
    path: entry.path,
    name: relative,
    type: entry.type === 'tree' ? 'dir' : 'file',
    size: entry.type === 'blob' ? entry.size : undefined,
  };
}

/** Path relative to prefix, or null when not under that prefix. */
function relativeUnderPrefix(fullPath: string, prefix: string): string | null {
  if (!prefix) return fullPath;
  const head = `${prefix}/`;
  if (!fullPath.startsWith(head)) return null;
  return fullPath.slice(head.length);
}

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
