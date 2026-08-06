import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { getSpecificationByVersion } from '@/features/specifications';

/**
 * One specification version by number.
 *
 * Shares the chat route's auth/resolve preamble — `requireUser` then
 * `resolveProjectSchema`, answering 404 for a missing or foreign project (no
 * existence leak). An invalid version (non-integer or `< 1`) is a 404 too: it
 * matches no row, and answering identically to a missing-but-well-formed
 * version avoids leaking the validation distinction. A valid-but-absent
 * version answers 404 `'Версия не найдена'`; a hit answers the full view.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version: rawVersion } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });
  }

  const spec = await getSpecificationByVersion(schemaName, version);
  if (!spec) {
    return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });
  }

  return NextResponse.json({
    id: spec.id,
    version: spec.version,
    content: spec.content,
    createdAt: spec.createdAt,
    createdBy: spec.createdBy,
  });
}
