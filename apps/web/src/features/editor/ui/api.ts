/**
 * Thin REST client for the editor UI. Russian error strings come from the API.
 */
import type { EditorCommitSummary, EditorDiff, EditorFileContent, TreeNode } from '../model/types';

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Ошибка ${String(res.status)}`;
}

export async function fetchTree(projectId: string): Promise<TreeNode[]> {
  const res = await fetch(`/api/projects/${projectId}/editor/tree`);
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { nodes?: TreeNode[] } | TreeNode[];
  return Array.isArray(data) ? data : (data.nodes ?? []);
}

export async function fetchFile(projectId: string, path: string): Promise<EditorFileContent> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`/api/projects/${projectId}/editor/file?${q}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as EditorFileContent;
}

export async function commitDirty(
  projectId: string,
  files: { path: string; content: string; sha?: string }[],
  message?: string,
): Promise<{ commitSha: string; files: string[] }> {
  const res = await fetch(`/api/projects/${projectId}/editor/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, files }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { commitSha: string; files: string[] };
}

export async function createEditorPath(
  projectId: string,
  path: string,
  opts: { content?: string; isDir?: boolean },
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/editor/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, ...opts }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function deleteEditorPath(
  projectId: string,
  path: string,
  sha: string,
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/editor/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, sha }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function renameEditorPath(
  projectId: string,
  fromPath: string,
  toPath: string,
  sha: string,
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/editor/files/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromPath, toPath, sha }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function fetchCommits(projectId: string): Promise<EditorCommitSummary[]> {
  const res = await fetch(`/api/projects/${projectId}/editor/commits?limit=20`);
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { commits?: EditorCommitSummary[] } | EditorCommitSummary[];
  return Array.isArray(data) ? data : (data.commits ?? []);
}

export async function fetchDiff(projectId: string, sha: string): Promise<EditorDiff> {
  const q = new URLSearchParams({ sha });
  const res = await fetch(`/api/projects/${projectId}/editor/diff?${q}`);
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as EditorDiff;
}
