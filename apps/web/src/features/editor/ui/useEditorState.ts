'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import type { TreeNode } from '../model/types';
import { fetchTree } from './api';
import type { DialogState } from './DialogHost';
import { applyDialog } from './editorActions';
import type { TabApi } from './useTabs';
import { useTabs } from './useTabs';
import { useEditorWs } from './useEditorWs';

export type { OpenFile } from './editorActions';

/** Client state for EditorShell: tree, tabs, save, dialogs, WS side-effects. */
export function useEditorState(projectId: string) {
  const tree = useTree(projectId);
  const [toast, setToast] = useState<string | null>(null);
  const [gitKey, setGitKey] = useState(0);
  const tabs = useTabs(projectId, tree.reloadTree, setToast);
  const chrome = useChrome();
  const dialogs = useDialogs({
    projectId,
    tabs,
    reloadTree: tree.reloadTree,
    setToast,
    setGitKey,
  });
  const { send } = useWsSideEffects({
    projectId,
    reloadTree: tree.reloadTree,
    setToast,
    setGitKey,
    chrome,
  });

  return {
    tree: tree.tree,
    treeLoading: tree.treeLoading,
    treeError: tree.treeError,
    reloadTree: tree.reloadTree,
    openFiles: tabs.openFiles,
    activePath: tabs.activePath,
    setActivePath: tabs.setActivePath,
    dirtyPaths: tabs.dirtyPaths,
    saving: tabs.saving,
    save: tabs.save,
    openPath: tabs.openPath,
    closeTab: tabs.closeTab,
    editContent: (value: string) => {
      tabs.editContent(value, (path) => {
        send({ type: 'editor.dirty', path });
      });
    },
    toast,
    setToast,
    gitKey,
    ...chrome,
    ...dialogs,
  };
}

function useWsSideEffects(args: {
  projectId: string;
  reloadTree: () => Promise<void>;
  setToast: (t: string | null) => void;
  setGitKey: Dispatch<SetStateAction<number>>;
  chrome: ReturnType<typeof useChrome>;
}) {
  const { projectId, reloadTree, setToast, setGitKey, chrome } = args;
  return useEditorWs(projectId, {
    onEvent: (event) => {
      if (event.type === 'editor.treeChanged') void reloadTree();
      if (event.type === 'editor.saved') {
        setToast(`Сохранено: ${event.path}`);
        setGitKey((k) => k + 1);
      }
      if (event.type === 'editor.error') setToast(event.message);
      if (event.type === 'terminal.ready') chrome.setTermReady(true);
      if (event.type === 'terminal.output') {
        chrome.setTermChunks((c) => [...c, event.chunk]);
      }
    },
    onStatus: (status, detail) => {
      if (status === 'disconnected' || status === 'error') setToast(detail ?? 'WebSocket');
    },
  });
}

function useTree(projectId: string) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);

  const reloadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      setTree(await fetchTree(projectId));
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Не удалось загрузить дерево');
    } finally {
      setTreeLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  return { tree, treeLoading, treeError, reloadTree };
}

function useChrome() {
  const [gitOpen, setGitOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(true);
  const [termReady, setTermReady] = useState(false);
  const [termChunks, setTermChunks] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return {
    gitOpen,
    setGitOpen,
    termOpen,
    setTermOpen,
    termReady,
    setTermReady,
    termChunks,
    setTermChunks,
    sidebarOpen,
    setSidebarOpen,
  };
}

function useDialogs(args: {
  projectId: string;
  tabs: TabApi;
  reloadTree: () => Promise<void>;
  setToast: (t: string | null) => void;
  setGitKey: Dispatch<SetStateAction<number>>;
}) {
  const { projectId, tabs, reloadTree, setToast, setGitKey } = args;
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  return {
    dialog,
    setDialog,
    dialogPending,
    dialogError,
    setDialogError,
    runDialog: async (value?: string) => {
      if (!dialog) return;
      setDialogPending(true);
      setDialogError(null);
      try {
        await applyDialog(projectId, dialog, value, tabs.openFiles);
        if (dialog.kind === 'delete') tabs.closeTab(dialog.path);
        setDialog(null);
        await reloadTree();
        setGitKey((k) => k + 1);
        setToast('Готово');
      } catch (err) {
        setDialogError(err instanceof Error ? err.message : 'Ошибка');
      } finally {
        setDialogPending(false);
      }
    },
  };
}
