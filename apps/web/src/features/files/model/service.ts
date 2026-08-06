/**
 * File data access against a project's own schema (`project_{uuid}`).
 * Mirrors `features/projects/model/service.ts` and `features/chat/model/service.ts`
 * in shape — a `toView()` helper, `getProjectClient(schemaName)` access,
 * soft-delete filters on every read, JSDoc on every export — because uploaded
 * files are project-scoped data behind the per-project isolation boundary
 * (docs/03-data-model.md), not platform metadata.
 *
 * Create writes two linked rows (`UserFile` + `Document`) inside a single
 * `$transaction` using Prisma's nested-create form. Both succeed or both
 * roll back: there is no window in which a file exists without a RAG document
 * to index it, nor a document whose backing file never landed.
 *
 * Soft-delete (`deletedAt: null` in every `where`) is the architectural
 * invariant from CLAUDE.md and is applied on the list read.
 */
import { getProjectClient } from '@aiflow/db';

import type { CreateUserFileInput, FileListItemView, UserFileView } from './types';

/** Prisma row → view. Drops `deletedAt` and the relation from the DTO. */
function toView(row: {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  createdAt: Date;
}): UserFileView {
  return {
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    storageKey: row.storageKey,
    createdAt: row.createdAt,
  };
}

/**
 * All non-deleted files in a project, newest first. The linked `Document` is
 * included only for its `status`; if no document exists the row falls back to
 * `PENDING` so the UI always has a renderable index state.
 */
export async function listFiles(schemaName: string): Promise<FileListItemView[]> {
  const client = getProjectClient(schemaName);
  const rows = await client.userFile.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { document: { select: { status: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    indexStatus: row.document?.status ?? 'PENDING',
    createdAt: row.createdAt,
  }));
}

/**
 * Record an uploaded file and its linked RAG document in one transaction.
 *
 * The nested-create form (`userFile.create({ data: { ..., document: { create: ... } } })`)
 * issues both inserts under a single SQL statement, and wrapping it in
 * `$transaction([...])` makes that atomicity explicit at the call site. Both
 * rows land together or neither does — there is no orphan file row or orphan
 * document. `storageKey` is the MinIO location written upstream; this service
 * records metadata only and never moves bytes. The array form (`[create, ...]`,
 * result at index `[0]`) is the version-compatible `$transaction` overload on
 * this Prisma generator.
 */
export async function createUserFile(
  schemaName: string,
  input: CreateUserFileInput,
): Promise<UserFileView> {
  const client = getProjectClient(schemaName);
  const [row] = await client.$transaction([
    client.userFile.create({
      data: {
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        storageKey: input.storageKey,
        document: {
          create: {
            sourceType: 'UPLOAD',
            title: input.fileName,
            status: 'PENDING',
          },
        },
      },
    }),
  ]);

  return toView(row);
}
