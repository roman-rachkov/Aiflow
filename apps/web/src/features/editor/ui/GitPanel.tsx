'use client';

import { useEffect, useState } from 'react';

import { DiffEditor } from '@monaco-editor/react';
import { Button, Spinner } from '@aiflow/ui';

import type { EditorCommitSummary, EditorDiff, EditorDiffFile } from '../model/types';
import { fetchCommits, fetchDiff } from './api';
import { languageFromPath } from './language';

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  refreshKey: number;
};

/** Right-side Git history + DiffEditor. */
export function GitPanel({ projectId, open, onClose, refreshKey }: Props) {
  const { commits, diff, setDiff, loading, error } = useGitData(projectId, open, refreshKey);
  if (!open) return null;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-surface text-sm lg:w-80">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-medium">Git</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center p-4">
            <Spinner label="Загрузка…" />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="p-3 text-danger">
            {error}
          </p>
        ) : null}
        <CommitList
          commits={commits}
          onSelect={(sha) => {
            void fetchDiff(projectId, sha)
              .then(setDiff)
              .catch(() => undefined);
          }}
        />
        <DiffSection diff={diff} />
      </div>
    </aside>
  );
}

function DiffSection({ diff }: { diff: EditorDiff | null }) {
  const file = diff?.files.at(0);
  if (!file) return null;
  return <DiffPreview file={file} />;
}

function useGitData(projectId: string, open: boolean, refreshKey: number) {
  const [commits, setCommits] = useState<EditorCommitSummary[]>([]);
  const [diff, setDiff] = useState<EditorDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchCommits(projectId)
      .then((rows) => {
        if (!cancelled) setCommits(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка истории');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, open, refreshKey]);

  return { commits, diff, setDiff, loading, error };
}

function CommitList({
  commits,
  onSelect,
}: {
  commits: EditorCommitSummary[];
  onSelect: (sha: string) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {commits.map((c) => (
        <li key={c.sha}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left hover:bg-surface-muted"
            onClick={() => {
              onSelect(c.sha);
            }}
          >
            <div className="font-mono text-xs text-primary">{c.shortSha}</div>
            <div className="truncate text-fg">{c.message}</div>
            <div className="text-xs text-fg-muted">{c.authorName}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function DiffPreview({ file }: { file: EditorDiffFile }) {
  const parts = splitPatch(file.patch);
  return (
    <div className="border-t border-border">
      <div className="px-3 py-1 text-xs text-fg-muted">{file.path}</div>
      <div className="h-48">
        <DiffEditor
          height="100%"
          theme="light"
          language={languageFromPath(file.path)}
          original={parts.original}
          modified={parts.modified}
          options={{ readOnly: true, renderSideBySide: false, minimap: { enabled: false } }}
        />
      </div>
    </div>
  );
}

function splitPatch(patch: string): { original: string; modified: string } {
  const orig: string[] = [];
  const mod: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) orig.push(line.slice(1));
    else if (line.startsWith('+')) mod.push(line.slice(1));
    else {
      const body = line.startsWith(' ') ? line.slice(1) : line;
      orig.push(body);
      mod.push(body);
    }
  }
  return { original: orig.join('\n'), modified: mod.join('\n') };
}
