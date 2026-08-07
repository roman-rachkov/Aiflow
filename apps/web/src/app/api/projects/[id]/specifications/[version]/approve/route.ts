import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { approveSpecification } from '@/features/specifications';

/**
 * Approve one specification version.
 *
 * Auth/resolve preamble matches the version GET route. Invalid version numbers
 * and missing rows both answer 404. Success returns the full view including
 * `approvedAt` so the preview panel can flip to «Start generation» without a
 * second fetch. Idempotent when already approved.
 */
export async function POST(
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

  const spec = await approveSpecification(schemaName, version, user.id);
  if (!spec) {
    return NextResponse.json({ error: 'Версия не найдена' }, { status: 404 });
  }

  return NextResponse.json({
    id: spec.id,
    version: spec.version,
    content: spec.content,
    createdAt: spec.createdAt,
    createdBy: spec.createdBy,
    approvedAt: spec.approvedAt,
  });
}
