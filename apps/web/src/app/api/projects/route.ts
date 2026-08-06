import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { createProject, listProjects } from '@/features/projects';
import { isGiteaUpstreamError } from '@/shared/gitea';

/**
 * Length caps mirrored from the client (`maxLength` on CreateProjectForm). The
 * client attribute is UX, not a bound — a curl POST bypasses it — so the same
 * limits are enforced here. `description` is `@db.Text` (unbounded), `name` is
 * `String`, hence the caps.
 */
const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;

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

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName.length === 0) {
    return NextResponse.json({ error: 'Введите название проекта' }, { status: 400 });
  }
  if (trimmedName.length > NAME_MAX) {
    return NextResponse.json(
      { error: `Название не должно превышать ${String(NAME_MAX)} символов` },
      { status: 400 },
    );
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (trimmedDescription.length > DESCRIPTION_MAX) {
    return NextResponse.json(
      { error: `Описание не должно превышать ${String(DESCRIPTION_MAX)} символов` },
      { status: 400 },
    );
  }

  try {
    const project = await createProject({
      name: trimmedName,
      description: trimmedDescription || undefined,
      ownerId: user.id,
    });
    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (err) {
    if (isGiteaUpstreamError(err)) {
      return NextResponse.json(
        { error: 'Не удалось создать репозиторий Git. Проверьте GITEA_ADMIN_TOKEN.' },
        { status: 502 },
      );
    }
    throw err;
  }
}
