'use client';

/**
 * Inline rename form for a thread row. Shown in place of the title button when
 * the user picks "Переименовать" from the row menu. Saves on Enter, cancels on
 * Escape or the Cancel button. Empty input is ignored (title kept as-is).
 */

import { useCallback, useState } from 'react';

export type ThreadRenameFormProps = {
  initial: string;
  onSave: (title: string) => void;
  onCancel: () => void;
};

export function ThreadRenameForm({ initial, onSave, onCancel }: ThreadRenameFormProps) {
  const [value, setValue] = useState(initial);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) onSave(trimmed);
    else onCancel();
  }, [value, onSave, onCancel]);

  return (
    <div className="openui-agent-thread-rename flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-1">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        className="min-w-0 flex-1 rounded border border-border bg-surface px-1.5 py-0.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded bg-primary px-2 py-0.5 text-xs text-white hover:bg-primary-hover"
      >
        ОК
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-1.5 py-0.5 text-xs text-fg-muted hover:text-fg"
      >
        ✕
      </button>
    </div>
  );
}
