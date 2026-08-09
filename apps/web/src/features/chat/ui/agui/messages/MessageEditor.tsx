'use client';

/**
 * Inline editor for an editable chat message — a textarea with Save / Cancel.
 * Lifted out of `AguiUserMessage` so the message component stays under the
 * 50-line function cap. Controlled: the parent owns the `draft` and the
 * save/cancel handlers.
 */

export type MessageEditorProps = {
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function MessageEditor({ value, onChange, onSave, onCancel }: MessageEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        autoFocus
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-2 py-1 text-xs text-fg-muted hover:text-fg"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded-md bg-primary px-2 py-1 text-xs text-white hover:bg-primary-hover"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
