/**
 * Single uploaded-file row: status badge + re-index trigger.
 */
'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

import { Button, Spinner } from '@aiflow/ui';

import type { FileListItemView } from '../model/types';

type Status = FileListItemView['indexStatus'];
type FileListSetter = Dispatch<SetStateAction<FileListItemView[]>>;

type IndexResponse = { status: Status };

type FileRowProps = {
  file: FileListItemView;
  projectId: string;
  setFiles: FileListSetter;
};

/** One file row: name, status badge, and the re-index trigger. */
export function FileRow({ file, projectId, setFiles }: FileRowProps) {
  const [indexing, setIndexing] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  return (
    <li className="flex items-center justify-between gap-2 border-t border-border pt-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{file.fileName}</p>
        <p className="text-xs text-fg-muted">
          <StatusBadge status={file.indexStatus} />
        </p>
        {rowError ? <p className="text-xs text-danger">{rowError}</p> : null}
      </div>
      {file.indexStatus !== 'INDEXED' ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={indexing}
          onClick={() =>
            void indexOne({ fileId: file.id, projectId, setFiles, setIndexing, setRowError })
          }
        >
          {indexing ? <Spinner size="sm" label={null} /> : 'Индексировать'}
        </Button>
      ) : null}
    </li>
  );
}

type IndexOpts = {
  fileId: string;
  projectId: string;
  setFiles: FileListSetter;
  setIndexing: (v: boolean) => void;
  setRowError: (v: string | null) => void;
};

/** Trigger indexing for one file and patch its status from the response. */
async function indexOne({ fileId, projectId, setFiles, setIndexing, setRowError }: IndexOpts) {
  setIndexing(true);
  setRowError(null);
  try {
    const res = await fetch(`/api/projects/${projectId}/files/${fileId}/index`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('index failed');
    const data = (await res.json()) as IndexResponse;
    setFiles((prev) =>
      prev.map((row) => (row.id === fileId ? { ...row, indexStatus: data.status } : row)),
    );
  } catch {
    setRowError('Ошибка индексации');
  } finally {
    setIndexing(false);
  }
}

/** Tiny coloured label for the document pipeline state. */
function StatusBadge({ status }: { status: Status }) {
  const tone =
    status === 'INDEXED' ? 'text-success' : status === 'FAILED' ? 'text-danger' : 'text-fg-muted';
  return <span className={tone}>{status}</span>;
}
