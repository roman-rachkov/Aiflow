'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

import type { DialogState } from './DialogHost';
import { applyDialog } from './editorActions';
import type { TabApi } from './useTabs';

type Args = {
  projectId: string;
  tabs: TabApi;
  reloadTree: () => Promise<void>;
  setToast: (t: string | null) => void;
  setGitKey: Dispatch<SetStateAction<number>>;
};

/** Create / rename / delete dialogs wired to path mutations. */
export function useEditorDialogs(args: Args) {
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
