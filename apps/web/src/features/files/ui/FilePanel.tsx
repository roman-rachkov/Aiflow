/**
 * FilePanel — the researcher's uploaded-files surface ('use client').
 *
 * Upload, list, and re-index mutate state from browser-driven fetches. The list
 * is seeded server-side via `initialFiles` (mirroring ChatPanel's
 * `initialMessages`) so first paint is complete. Russian strings per the
 * product language policy (CLAUDE.md). No toast library yet, so errors are
 * inline text. Async handlers are top-level fns taking one options object and
 * are called with `void` from JSX so onClick/onChange stay void-returning
 * (eslint no-misused-promises) and component fns stay compact.
 */
'use client';

import { useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';

import { Button, Card, CardTitle, Spinner } from '@aiflow/ui';

import type { FileListItemView } from '../model/types';

export type FilePanelProps = {
  /** Preloaded file list (server-rendered). Empty for a fresh project. */
  initialFiles: FileListItemView[];
  /** Project id — routes each call to /api/projects/{id}/files. */
  projectId: string;
};

type Status = FileListItemView['indexStatus'];
type FileListSetter = Dispatch<SetStateAction<FileListItemView[]>>;
type CreatedFile = { id: string; fileName: string; fileSize: number; mimeType: string };
type IndexResponse = { status: Status };

export function FilePanel({ initialFiles, projectId }: FilePanelProps) {
  const [files, setFiles] = useState<FileListItemView[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <FileHeader uploading={uploading} onPick={() => inputRef.current?.click()} />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => void upload({ event: e, projectId, setFiles, setUploading, setError })}
      />
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <FileList files={files} projectId={projectId} setFiles={setFiles} />
    </Card>
  );
}

/** Card header: title + upload button. The hidden input lives in the parent. */
function FileHeader({ uploading, onPick }: { uploading: boolean; onPick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <CardTitle>Загруженные файлы</CardTitle>
      <Button size="sm" variant="secondary" disabled={uploading} onClick={onPick}>
        {uploading ? <Spinner size="sm" label={null} /> : 'Загрузить файл'}
      </Button>
    </div>
  );
}

/** The file list or its empty state. */
function FileList({
  files,
  projectId,
  setFiles,
}: {
  files: FileListItemView[];
  projectId: string;
  setFiles: FileListSetter;
}) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {files.length === 0 ? (
        <li className="text-sm text-fg-muted">Нет файлов</li>
      ) : (
        files.map((file) => (
          <FileRow key={file.id} file={file} projectId={projectId} setFiles={setFiles} />
        ))
      )}
    </ul>
  );
}

/** One file row: name, status badge, and the re-index trigger. */
function FileRow({
  file,
  projectId,
  setFiles,
}: {
  file: FileListItemView;
  projectId: string;
  setFiles: FileListSetter;
}) {
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

type UploadOpts = {
  event: ChangeEvent<HTMLInputElement>;
  projectId: string;
  setFiles: FileListSetter;
  setUploading: (v: boolean) => void;
  setError: (v: string | null) => void;
};

/** Upload one file and prepend the returned row (PENDING) on success. */
async function upload({ event, projectId, setFiles, setUploading, setError }: UploadOpts) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  setUploading(true);
  setError(null);
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/projects/${projectId}/files`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('upload failed');
    const created = (await res.json()) as CreatedFile;
    setFiles((prev) => [toRow(created), ...prev]);
  } catch {
    setError('Не удалось загрузить файл');
  } finally {
    setUploading(false);
  }
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

/** Map an upload response into a PENDING list row. */
function toRow(created: CreatedFile): FileListItemView {
  return {
    id: created.id,
    fileName: created.fileName,
    fileSize: created.fileSize,
    mimeType: created.mimeType,
    indexStatus: 'PENDING',
    createdAt: new Date(),
  };
}

/** Tiny coloured label for the document pipeline state. */
function StatusBadge({ status }: { status: Status }) {
  const tone =
    status === 'INDEXED' ? 'text-success' : status === 'FAILED' ? 'text-danger' : 'text-fg-muted';
  return <span className={tone}>{status}</span>;
}
