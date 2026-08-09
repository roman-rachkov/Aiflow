'use client';

/**
 * Radix DropdownMenu of thread actions: Rename / Fork / Delete.
 *
 * Extracted from `ThreadRow` to keep that component under the function-line
 * cap. Delete calls the headless `deleteThread` directly (the built-in flow,
 * soft-delete via our storage); Rename and Fork are delegated to the row via
 * callbacks. Uses `lucide-react` icons (already a transitive OpenUI dep).
 */

import { useCallback, useState } from 'react';
import { useThreadList } from '@openuidev/react-headless';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical, Pencil, GitBranch, Trash2 } from 'lucide-react';

export type ThreadRowMenuProps = {
  threadId: string;
  onRename: () => void;
  onFork: () => Promise<void>;
};

export function ThreadRowMenu({ threadId, onRename, onFork }: ThreadRowMenuProps) {
  const deleteThread = useThreadList((s) => s.deleteThread);
  const [open, setOpen] = useState(false);

  const handleRename = useCallback(() => {
    onRename();
  }, [onRename]);

  const handleFork = useCallback(() => {
    void onFork();
  }, [onFork]);

  const handleDelete = useCallback(() => {
    deleteThread(threadId);
  }, [deleteThread, threadId]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-fg-muted hover:bg-surface hover:text-fg"
          aria-label="Действия с чатом"
        >
          <MoreVertical size="1em" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="openui-agent-thread-button-dropdown-menu z-50 min-w-[10rem] rounded-md border border-border bg-surface py-1 shadow-md"
          side="bottom"
          align="end"
          sideOffset={4}
        >
          <MenuItem icon={<Pencil size="0.9em" />} onSelect={handleRename}>
            Переименовать
          </MenuItem>
          <MenuItem icon={<GitBranch size="0.9em" />} onSelect={handleFork}>
            Ответвить
          </MenuItem>
          <MenuItem icon={<Trash2 size="0.9em" />} onSelect={handleDelete} danger>
            Удалить
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type MenuItemProps = {
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  children: React.ReactNode;
};

function MenuItem({ icon, onSelect, danger, children }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-muted ${
        danger ? 'text-danger' : 'text-fg'
      }`}
      onSelect={onSelect}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}
