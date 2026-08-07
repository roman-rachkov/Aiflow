/**
 * Browser upload helper for FilePanel (POST multipart → prepend PENDING row).
 */
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';

import type { FileListItemView } from '../model/types';

type FileListSetter = Dispatch<SetStateAction<FileListItemView[]>>;
type CreatedFile = { id: string; fileName: string; fileSize: number; mimeType: string };

export type UploadOpts = {
  event: ChangeEvent<HTMLInputElement>;
  projectId: string;
  setFiles: FileListSetter;
  setUploading: (v: boolean) => void;
  setError: (v: string | null) => void;
};

/** Upload one file and prepend the returned row (PENDING) on success. */
export async function uploadFile({
  event,
  projectId,
  setFiles,
  setUploading,
  setError,
}: UploadOpts): Promise<void> {
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
