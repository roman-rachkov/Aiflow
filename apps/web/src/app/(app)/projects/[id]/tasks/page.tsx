import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '@/features/auth';
import { getProject } from '@/features/projects';

/**
 * Tasks / roadmap stub. Planner enqueue (`plan:generate`) is MVP-1; this page
 * exists so «Запустить генерацию» after SPEC approval has a destination that
 * does not 404.
 */
export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);
  if (!project) notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Задачи · {project.name}</h1>
      <p className="text-sm text-fg-muted">
        План появится после запуска Planner (MVP-1). Сейчас спецификацию можно утвердить на экране
        исследования; очередь plan:generate ещё не подключена.
      </p>
      <Link href={`/projects/${id}/research`} className="text-sm text-primary hover:underline">
        ← Вернуться к исследованию
      </Link>
    </div>
  );
}
