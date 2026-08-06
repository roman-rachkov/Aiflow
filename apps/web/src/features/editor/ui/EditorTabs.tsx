'use client';

type Tab = { path: string; dirty: boolean };

type Props = {
  tabs: Tab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
};

/** Open-file tabs above Monaco. */
export function EditorTabs({ tabs, activePath, onSelect, onClose }: Props) {
  if (tabs.length === 0) {
    return (
      <div className="border-b border-border px-3 py-2 text-sm text-fg-muted">
        Выберите файл в дереве
      </div>
    );
  }

  return (
    <div className="flex gap-0.5 overflow-x-auto border-b border-border bg-surface px-1">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const name = tab.path.includes('/')
          ? tab.path.slice(tab.path.lastIndexOf('/') + 1)
          : tab.path;
        return (
          <div
            key={tab.path}
            className={`flex items-center gap-1 rounded-t px-2 py-1.5 text-sm ${
              active ? 'bg-white text-fg' : 'text-fg-muted hover:bg-surface-muted'
            }`}
          >
            <button
              type="button"
              className="max-w-[10rem] truncate"
              onClick={() => {
                onSelect(tab.path);
              }}
            >
              {name}
              {tab.dirty ? ' •' : ''}
            </button>
            <button
              type="button"
              className="text-fg-muted hover:text-fg"
              aria-label="Закрыть"
              onClick={() => {
                onClose(tab.path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
