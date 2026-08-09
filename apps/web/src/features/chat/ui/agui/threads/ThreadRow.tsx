'use client';

/**
 * One thread row in the custom sidebar list: title button + actions menu.
 *
 * Selected state mirrors the OpenUI `ThreadButton` styling. Rename swaps the
 * row for `ThreadRenameForm`; Fork and the rename-save/fork logic live in
 * `useThreadActions`. The actions menu is `ThreadRowMenu`.
 */

import { useCallback, useState } from 'react';
import { useThreadList } from '@openuidev/react-headless';

import { ThreadRenameForm } from './ThreadRenameForm';
import { ThreadRowMenu } from './ThreadRowMenu';
import { useThreadActions } from './useThreadActions';
import type { ThreadRowProps } from './AguiThreadList';

function rowClass(selected: boolean): string {
  const base = 'openui-agent-thread-button flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ';
  return selected
    ? `${base}bg-surface-muted text-fg`
    : `${base}text-fg-muted hover:bg-surface-muted hover:text-fg`;
}

export function ThreadRow({ thread, onSelect }: ThreadRowProps) {
  const selectedThreadId = useThreadList((s) => s.selectedThreadId);
  const [renaming, setRenaming] = useState(false);
  const { onRenameSave, onFork } = useThreadActions(thread, onSelect);

  const cancelRename = useCallback(() => {
    setRenaming(false);
  }, []);
  const startRename = useCallback(() => {
    setRenaming(true);
  }, []);
  const select = useCallback(() => {
    onSelect(thread.id);
  }, [onSelect, thread.id]);

  if (renaming) {
    return (
      <ThreadRenameForm initial={thread.title} onSave={onRenameSave} onCancel={cancelRename} />
    );
  }

  return (
    <div className={rowClass(selectedThreadId === thread.id)}>
      <button
        type="button"
        className="openui-agent-thread-button-title flex-1 truncate text-left"
        onClick={select}
        title={thread.title}
      >
        {thread.title}
      </button>
      <ThreadRowMenu threadId={thread.id} onRename={startRename} onFork={onFork} />
    </div>
  );
}
