'use client';

import type { Dispatch, SetStateAction } from 'react';

import type { EditorChrome } from './useEditorChrome';
import { useEditorWs } from './useEditorWs';

type Args = {
  projectId: string;
  reloadTree: () => Promise<void>;
  setToast: (t: string | null) => void;
  setGitKey: Dispatch<SetStateAction<number>>;
  chrome: EditorChrome;
};

/** Map editor WS events onto tree reload, toasts, and terminal chrome. */
export function useEditorWsSideEffects(args: Args) {
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
