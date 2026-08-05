import { notFound } from 'next/navigation';

import Link from 'next/link';

import { getPublicClient } from '@aiflow/db';
import { Button, Card, CardDescription, CardTitle } from '@aiflow/ui';

import { requireUser } from '@/features/auth';
import { ChatPanel, listMessages } from '@/features/chat';
import { getProject } from '@/features/projects';

/**
 * Researcher page for one project: artifacts panel + Analyst chat.
 *
 * Mirrors `app/(app)/projects/[id]/page.tsx`. `params` is a Promise in Next 15.
 * `getProject` returns `null` for missing / deleted / foreign-owned — all three
 * map to `notFound()`, so existence is never leaked. `schemaName` is fetched
 * separately (it is an internal routing key not exposed on `ProjectView`) and
 * resolves the project's own schema for chat history.
 */
export default async function ResearcherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);

  if (!project) notFound();

  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id },
    select: { schemaName: true },
  });
  if (!meta) notFound();

  const messages = await listMessages(meta.schemaName);

  return (
    <div className="flex h-full gap-4">
      <aside className="hidden w-1/5 shrink-0 md:block">
        <ResearcherArtifacts projectId={id} />
      </aside>
      <section className="flex-1">
        <ChatPanel initialMessages={messages} projectId={id} />
      </section>
    </div>
  );
}

/**
 * MVP-0 artifacts panel: three placeholders and an inert "create spec" button.
 * Each card is a stub for a feature not yet built — the strings are Russian per
 * the product language policy (CLAUDE.md).
 */
function ResearcherArtifacts({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Спецификация</CardTitle>
        <CardDescription className="mt-2">Спецификация не создана</CardDescription>
      </Card>

      <Card>
        <CardTitle>Загруженные файлы</CardTitle>
        <CardDescription className="mt-2">Нет файлов</CardDescription>
      </Card>

      <Card interactive>
        <CardTitle>
          <Link href={`/projects/${projectId}/tasks`} className="block">
            Дорожная карта
          </Link>
        </CardTitle>
      </Card>

      <Button disabled title="Генерация спецификации будет доступна позже">
        Создать спецификацию
      </Button>
    </div>
  );
}
