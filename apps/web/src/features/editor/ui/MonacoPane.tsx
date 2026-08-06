'use client';

/**
 * Monaco editor pane. `@monaco-editor/react` is MIT (allowlisted §8 / SPEC #13).
 * Loaded client-only via dynamic import from EditorShell.
 */
import Editor from '@monaco-editor/react';

import { Spinner } from '@aiflow/ui';

import { languageFromPath } from './language';

type Props = {
  path: string | null;
  value: string;
  onChange: (value: string) => void;
};

export function MonacoPane({ path, value, onChange }: Props) {
  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-muted">
        Нет открытого файла
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      theme="light"
      path={path}
      language={languageFromPath(path)}
      value={value}
      loading={<Spinner label="Загрузка редактора…" />}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: 'Inter, ui-monospace, monospace',
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
      onChange={(next) => {
        onChange(next ?? '');
      }}
    />
  );
}
