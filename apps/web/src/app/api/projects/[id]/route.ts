import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { getProject, removeProject } from '@/features/projects';

/**
 * One project — detail and delete.
 *
 * Both handlers treat missing/foreign/deleted the same way (`getProject`
 * returns `null`): a 404 that does not reveal whether the project exists.
 * Delete is soft-delete; the schema is retained for restore.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const removed = await removeProject(id, user.id);

  if (!removed) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
