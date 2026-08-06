/**
 * File data as the UI and API surface it, mirroring the view shape used by the
 * chat and projects slices. Each view is a deliberate subset of the underlying
 * `UserFile` / `Document` rows: `deletedAt` is never part of the DTO (soft
 * deletes are filtered in the service layer, not leaked through), and the
 * `storageKey` is a MinIO address rather than anything the caller renders.
 */

/** A single uploaded file as returned from `createUserFile`. */
export interface UserFileView {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  createdAt: Date;
}

/**
 * One row in the file list. `indexStatus` is copied from the linked `Document`
 * (`PENDING` when the row exists without a document yet) so the UI can render
 * the indexing pipeline state alongside the file metadata.
 */
export interface FileListItemView {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  indexStatus: 'PENDING' | 'INDEXING' | 'INDEXED' | 'FAILED';
  createdAt: Date;
}

/**
 * Input for creating a file row. `storageKey` is the location already written
 * to MinIO upstream; the service never moves bytes, it only records metadata
 * and kicks off the linked `Document`.
 */
export interface CreateUserFileInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
}
