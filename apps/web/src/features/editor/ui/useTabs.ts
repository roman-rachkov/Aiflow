'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { loadOpenFile, omitPath, saveDirtyFiles, type OpenFile } from './editorActions';

export type TabApi = {
  openFiles: Record<string, OpenFile>;
  setOpenFiles: Dispatch<SetStateAction<Record<string, OpenFile>>>;
  activePath: string | null;
  setActivePath: Dispatch<SetStateAction<string | null>>;
  dirtyPaths: Set<string>;
  saving: boolean;
  save: () => Promise<void>;
  editContent: (value: string, sendDirty: (path: string) => void) => void;
  openPath: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
};

export function useTabs(
  projectId: string,
  reloadTree: () => Promise<void>,
  setToast: (t: string | null) => void,
): TabApi {
  const [openFiles, setOpenFiles] = useState<Record<string, OpenFile>>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyPaths = dirtySet(openFiles);
  const save = useSave({
    projectId,
    openFiles,
    setOpenFiles,
    reloadTree,
    setToast,
    setSaving,
  });

  return {
    openFiles,
    setOpenFiles,
    activePath,
    setActivePath,
    dirtyPaths,
    saving,
    save,
    editContent: (value, sendDirty) => {
      editOpenFile(activePath, value, setOpenFiles, sendDirty);
    },
    openPath: (path) =>
      openFileTab({ projectId, path, openFiles, setOpenFiles, setActivePath, setToast }),
    closeTab: (path) => {
      setOpenFiles((prev) => omitPath(prev, path));
      setActivePath((cur) => (cur === path ? null : cur));
    },
  };
}

function dirtySet(openFiles: Record<string, OpenFile>): Set<string> {
  return new Set(
    Object.entries(openFiles)
      .filter(([, f]) => f.content !== f.baseline)
      .map(([p]) => p),
  );
}

function useSave(args: {
  projectId: string;
  openFiles: Record<string, OpenFile>;
  setOpenFiles: Dispatch<SetStateAction<Record<string, OpenFile>>>;
  reloadTree: () => Promise<void>;
  setToast: (t: string | null) => void;
  setSaving: Dispatch<SetStateAction<boolean>>;
}): () => Promise<void> {
  const { projectId, openFiles, setOpenFiles, reloadTree, setToast, setSaving } = args;
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await saveDirtyFiles(projectId, openFiles);
      if (result.files.length === 0) return;
      setToast('Изменения сохранены');
      const refreshed = await refreshOpenShas(projectId, openFiles, result);
      setOpenFiles(refreshed);
      await reloadTree();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, [openFiles, projectId, reloadTree, setOpenFiles, setSaving, setToast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [save]);

  return save;
}

function editOpenFile(
  activePath: string | null,
  value: string,
  setOpenFiles: Dispatch<SetStateAction<Record<string, OpenFile>>>,
  sendDirty: (path: string) => void,
): void {
  if (!activePath) return;
  const path = activePath;
  setOpenFiles((prev) => {
    if (!Object.hasOwn(prev, path)) return prev;
    return { ...prev, [path]: { ...prev[path], content: value } };
  });
  sendDirty(path);
}

async function openFileTab(args: {
  projectId: string;
  path: string;
  openFiles: Record<string, OpenFile>;
  setOpenFiles: Dispatch<SetStateAction<Record<string, OpenFile>>>;
  setActivePath: Dispatch<SetStateAction<string | null>>;
  setToast: (t: string | null) => void;
}): Promise<void> {
  const { projectId, path, openFiles, setOpenFiles, setActivePath, setToast } = args;
  if (Object.hasOwn(openFiles, path)) {
    setActivePath(path);
    return;
  }
  try {
    const file = await loadOpenFile(projectId, path);
    setOpenFiles((prev) => ({ ...prev, [path]: file }));
    setActivePath(path);
  } catch (err) {
    setToast(err instanceof Error ? err.message : 'Не удалось открыть файл');
  }
}

/** Re-read blob SHAs after commit (commitSha ≠ Contents sha). */
async function refreshOpenShas(
  projectId: string,
  openFiles: Record<string, OpenFile>,
  result: { files: string[] },
): Promise<Record<string, OpenFile>> {
  const next = { ...openFiles };
  for (const path of result.files) {
    if (!Object.hasOwn(next, path)) continue;
    const file = await loadOpenFile(projectId, path);
    next[path] = { content: file.content, sha: file.sha, baseline: file.content };
  }
  return next;
}
