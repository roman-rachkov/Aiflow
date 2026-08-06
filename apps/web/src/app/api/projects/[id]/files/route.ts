import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { createUserFile, listFiles } from '@/features/files';
import { resolveProjectSchema } from '@/features/projects';
import { putObject } from '@/shared/minio';

/**
 * Upload and list endpoints for a project's files.
 *
 * Both handlers share the chat route's auth/resolve preamble — a missing or
 * foreign project answers 404 (no existence leak), and the per-project schema
 * name resolves before any bytes move. Upload validates the MIME allowlist
 * before writing to MinIO, then records the `UserFile` + linked `Document`
 * (PENDING) row in one transaction via the files slice. The storage key is
 * prefixed with the schema name so two projects can never collide in the
 * shared bucket. List returns the slice's view, which already carries the
 * document's `indexStatus`.
 */

/** MIME types the upload pipeline can index. Kept in sync with the RAG worker. */
const ALLOWED_MIME = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/json',
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не прикреплён' }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Неподдерживаемый тип файла' }, { status: 400 });
  }

  // Prefix the key with the project schema so two projects never share an
  // object namespace inside the single bucket.
  const storageKey = `${schemaName}/${randomUUID()}`;
  try {
    await putObject(storageKey, Buffer.from(await file.arrayBuffer()), {
      'content-type': file.type,
    });
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить файл' }, { status: 500 });
  }

  const view = await createUserFile(schemaName, {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    storageKey,
  });

  return NextResponse.json(
    {
      id: view.id,
      fileName: view.fileName,
      fileSize: view.fileSize,
      mimeType: view.mimeType,
      storageKey: view.storageKey,
    },
    { status: 201 },
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const files = await listFiles(schemaName);
  return NextResponse.json(files);
}
