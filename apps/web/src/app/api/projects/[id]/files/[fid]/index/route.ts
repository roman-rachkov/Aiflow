import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { indexDocument } from '@/features/files/model/index-service';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Trigger synchronous indexing of one uploaded file.
 *
 * Shares the chat route's auth/resolve preamble — `requireUser` then
 * `resolveProjectSchema`, answering 404 for a missing or foreign project (no
 * existence leak). The heavy lifting lives in the files slice's
 * `indexDocument`: it never throws, returning a structured `{ status, ... }`
 * result, so this handler always answers 200 with the outcome — `INDEXED` or
 * `FAILED` with a short `reason`. A 500 would mean an unexpected throw from
 * the service, which is treated as a generic indexing failure.
 *
 * Deep import into `features/files/model/index-service` rather than the slice
 * barrel: `indexDocument` is intentionally not re-exported from the barrel
 * (the slice's public surface stays the file CRUD + chunk helpers), and the
 * route lives in `app/`, where `import/no-internal-modules` is scoped to
 * `features` so this `app/`-side deep import is allowed.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; fid: string }> },
) {
  const { id, fid } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const result = await indexDocument(schemaName, fid);
  return NextResponse.json(
    {
      documentId: result.documentId,
      status: result.status,
      chunkCount: result.chunkCount,
      ...(result.reason ? { reason: result.reason } : {}),
    },
    { status: 200 },
  );
}
