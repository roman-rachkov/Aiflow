import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { getTaskDetail } from '@/features/tasks';

/**
 * GET — task detail + TaskLog (owner BASIC+PRO).
 */

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await ctx.params;
  const user = await requireUser();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }
  const detail = await getTaskDetail(schemaName, taskId);
  if (!detail) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
  }
  return NextResponse.json(detail);
}
