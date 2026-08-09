'use client';

/**
 * Action toolbar for a chat message. Renders a compact row of icon buttons that
 * appears on hover/focus of the message (opacity transition) — the grown-up
 * chat pattern. Each action is a controlled callback; the toolbar itself owns
 * no state beyond the transient "copied" confirmation.
 */

import { type ReactNode, useCallback, useState } from 'react';

import { CopyIcon, CheckIcon, EditIcon, TrashIcon, RefreshIcon } from './icons';

export interface MessageAction {
  /** Stable key for the button. */
  id: 'copy' | 'edit' | 'delete' | 'regenerate';
  /** Accessible label + title. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export type MessageActionsProps = {
  /** Actions to render, in order. Empty → renders nothing. */
  actions: MessageAction[];
};

export function MessageActions({ actions }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((action: MessageAction) => {
    action.onClick();
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1500);
  }, []);

  if (actions.length === 0) return null;

  return (
    <div
      className="openui-agent-message-actions flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      role="toolbar"
    >
      {actions.map((action) => {
        const isCopy = action.id === 'copy';
        const showCheck = isCopy && copied;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => {
              if (isCopy) handleCopy(action);
              else action.onClick();
            }}
            title={action.label}
            aria-label={action.label}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {showCheck ? <CheckIcon className="text-success" /> : action.icon}
          </button>
        );
      })}
    </div>
  );
}

/** Convenience: build the standard assistant action set from callbacks. */
export function assistantActions(opts: {
  content: string;
  onRegenerate: () => void;
}): MessageAction[] {
  return [
    {
      id: 'copy',
      label: 'Копировать',
      icon: <CopyIcon />,
      onClick: () => {
        void navigator.clipboard.writeText(opts.content);
      },
    },
    {
      id: 'regenerate',
      label: 'Сгенерировать заново',
      icon: <RefreshIcon />,
      onClick: opts.onRegenerate,
    },
  ];
}

/** Convenience: build the standard user action set from callbacks. */
export function userActions(opts: { onDelete: () => void; onEdit: () => void }): MessageAction[] {
  return [
    { id: 'edit', label: 'Редактировать', icon: <EditIcon />, onClick: opts.onEdit },
    { id: 'delete', label: 'Удалить', icon: <TrashIcon />, onClick: opts.onDelete },
  ];
}
