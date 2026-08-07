'use client';

import { useState } from 'react';

import { useEditorChrome } from './useEditorChrome';
import { useEditorDialogs } from './useEditorDialogs';
import { useEditorTree } from './useEditorTree';
import { useEditorWsSideEffects } from './useEditorWsSideEffects';
import { useTabs } from './useTabs';

export type { OpenFile } from './editorActions';

/** Client state for EditorShell: tree, tabs, save, dialogs, WS side-effects. */
export function useEditorState(projectId: string) {
  const tree = useEditorTree(projectId);
  const [toast, setToast] = useState<string | null>(null);
  const [gitKey, setGitKey] = useState(0);
  const tabs = useTabs(projectId, tree.reloadTree, setToast);
  const chrome = useEditorChrome();
  const dialogs = useEditorDialogs({
    projectId,
    tabs,
    reloadTree: tree.reloadTree,
    setToast,
    setGitKey,
  });
  const { send } = useEditorWsSideEffects({
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
