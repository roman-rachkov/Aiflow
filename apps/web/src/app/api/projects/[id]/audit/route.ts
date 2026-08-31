import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { assertProAudit, listProjectAudit } from '@/features/audit';
import { getProject } from '@/features/projects';

/**
 * GET — Pro audit event feed for a project (optional ?taskId=).
 * Chronological; used to reconstruct attempt + verdict history.
 */

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requireUser();
  const forbidden = assertProAudit(user);
  if (forbidden) return forbidden;

  const project = await getProject(id, user.id);
  if (!project) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  const taskId = new URL(request.url).searchParams.get('taskId') ?? undefined;
  const events = await listProjectAudit(project.id, taskId || undefined);
  return NextResponse.json({ events });
}
