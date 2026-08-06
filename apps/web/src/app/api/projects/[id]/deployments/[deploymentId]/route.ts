import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { getDeployment } from '@/features/deploy';
import { resolveProjectSchema } from '@/features/projects';

/**
 * GET — deployment detail including full build log (owner BASIC+PRO).
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; deploymentId: string }> },
) {
  const { id, deploymentId } = await params;
  const user = await requireUser();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const detail = await getDeployment(schemaName, id, deploymentId);
  if (!detail) {
    return NextResponse.json({ error: 'Сборка не найдена' }, { status: 404 });
  }
  return NextResponse.json(detail);
}
