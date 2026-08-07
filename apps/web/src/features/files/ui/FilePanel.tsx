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

import { useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { Button, Card, CardTitle, Spinner } from '@aiflow/ui';

import type { FileListItemView } from '../model/types';
import { uploadFile } from './file-panel-upload';
import { FileRow } from './FileRow';

export type FilePanelProps = {
  /** Preloaded file list (server-rendered). Empty for a fresh project. */
  initialFiles: FileListItemView[];
  /** Project id — routes each call to /api/projects/{id}/files. */
  projectId: string;
};

type FileListSetter = Dispatch<SetStateAction<FileListItemView[]>>;

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
        onChange={(e) => void uploadFile({ event: e, projectId, setFiles, setUploading, setError })}
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
