import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { createProject, listProjects } from '@/features/projects';

/**
 * Projects collection — list and create.
 *
 * `requireUser` enforces the session and yields the owner id; the body never
 * supplies `ownerId` (it is taken from the session, not trusted from the
 * client). The handlers are thin: auth + validation + delegation to the
 * service. `app/` is routing only.
 */
export async function GET() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const user = await requireUser();

  const formData = await request.formData();
  const name = formData.get('name');
  const description = formData.get('description');

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Введите название проекта' }, { status: 400 });
  }

  const project = await createProject({
    name: name.trim(),
    description:
      typeof description === 'string' && description.trim() ? description.trim() : undefined,
    ownerId: user.id,
  });

  return NextResponse.json({ id: project.id }, { status: 201 });
}
