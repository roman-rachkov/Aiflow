'use client';

import {
  commitDirty,
  createEditorPath,
  deleteEditorPath,
  fetchFile,
  renameEditorPath,
} from './api';
import type { DialogState } from './DialogHost';

export type OpenFile = { content: string; sha: string; baseline: string };

export async function saveDirtyFiles(
  projectId: string,
  openFiles: Record<string, OpenFile>,
): Promise<{ commitSha: string; files: string[] }> {
  const files = Object.entries(openFiles)
    .filter(([, f]) => f.content !== f.baseline)
    .map(([path, f]) => ({ path, content: f.content, sha: f.sha }));
  if (files.length === 0) return { commitSha: '', files: [] };
  return commitDirty(projectId, files);
}

export function patchAfterSave(
  prev: Record<string, OpenFile>,
  result: { commitSha: string; files: string[] },
): Record<string, OpenFile> {
  const next = { ...prev };
  for (const path of result.files) {
    if (!Object.hasOwn(next, path)) continue;
    const cur = next[path];
    next[path] = { ...cur, baseline: cur.content, sha: result.commitSha };
  }
  return next;
}

export function omitPath(prev: Record<string, OpenFile>, path: string): Record<string, OpenFile> {
  return Object.fromEntries(Object.entries(prev).filter(([p]) => p !== path));
}

export async function applyDialog(
  projectId: string,
  dialog: DialogState,
  value: string | undefined,
  openFiles: Record<string, OpenFile>,
): Promise<void> {
  if (dialog.kind === 'create') {
    if (!value) return;
    await createEditorPath(projectId, value, {
      isDir: dialog.isDir,
      content: dialog.isDir ? undefined : '',
    });
    return;
  }
  const cached = Object.hasOwn(openFiles, dialog.path) ? openFiles[dialog.path] : undefined;
  if (dialog.kind === 'rename') {
    if (!value) return;
    const file = cached ?? (await fetchFile(projectId, dialog.path));
    await renameEditorPath(projectId, dialog.path, value, file.sha);
    return;
  }
  const file = cached ?? (await fetchFile(projectId, dialog.path));
  await deleteEditorPath(projectId, dialog.path, file.sha);
}

export async function loadOpenFile(projectId: string, path: string): Promise<OpenFile> {
  const file = await fetchFile(projectId, path);
  return { content: file.content, sha: file.sha, baseline: file.content };
}
