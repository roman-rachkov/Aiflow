'use client';

import dynamic from 'next/dynamic';

import { Button, Spinner } from '@aiflow/ui';

import { EditorTabs } from './EditorTabs';

const MonacoPane = dynamic(
  async () => {
    const m = await import('./MonacoPane');
    return m.MonacoPane;
  },
  { ssr: false, loading: () => <Spinner label="Загрузка редактора…" /> },
);

type OpenFile = { content: string; sha: string; baseline: string };

type Props = {
  openFiles: Record<string, OpenFile>;
  activePath: string | null;
  dirtyPaths: Set<string>;
  saving: boolean;
  toast: string | null;
  onSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onBuild: () => void;
  onToggleGit: () => void;
  onDismissToast: () => void;
};

export function CenterColumn(props: Props) {
  const tabs = Object.keys(props.openFiles).map((path) => ({
    path,
    dirty: props.dirtyPaths.has(path),
  }));
  const active = props.activePath ? props.openFiles[props.activePath] : undefined;

  return (
    <>
      <Toolbar {...props} hasDirty={props.dirtyPaths.size > 0} />
      <EditorTabs
        tabs={tabs}
        activePath={props.activePath}
        onSelect={props.onSelect}
        onClose={props.onCloseTab}
      />
      <div className="min-h-0 flex-1">
        <MonacoPane
          path={props.activePath}
          value={active?.content ?? ''}
          onChange={props.onChange}
        />
      </div>
    </>
  );
}

function Toolbar({
  hasDirty,
  saving,
  toast,
  onSave,
  onBuild,
  onToggleGit,
  onDismissToast,
}: {
  hasDirty: boolean;
  saving: boolean;
  toast: string | null;
  onSave: () => void;
  onBuild: () => void;
  onToggleGit: () => void;
  onDismissToast: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-2 py-1">
      <Button size="sm" disabled={!hasDirty || saving} onClick={onSave}>
        {saving ? 'Сохранение…' : 'Сохранить'}
      </Button>
      <Button variant="secondary" size="sm" onClick={onBuild}>
        Сборка
      </Button>
      <Button variant="ghost" size="sm" onClick={onToggleGit}>
        Git
      </Button>
      {toast ? (
        <button
          type="button"
          className="ml-auto truncate text-xs text-fg-muted"
          onClick={onDismissToast}
        >
          {toast}
        </button>
      ) : null}
    </div>
  );
}
