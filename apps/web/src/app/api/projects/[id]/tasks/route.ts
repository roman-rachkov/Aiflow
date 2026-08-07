import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { listTasks } from '@/features/tasks';

/**
 * GET — list roadmap tasks (owner BASIC+PRO).
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }
  const items = await listTasks(schemaName);
  return NextResponse.json(items);
}
