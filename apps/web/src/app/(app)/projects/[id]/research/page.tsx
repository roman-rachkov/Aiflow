import { notFound } from 'next/navigation';

import Link from 'next/link';

import { getPublicClient } from '@aiflow/db';
import { Card, CardTitle } from '@aiflow/ui';

import { requireUser } from '@/features/auth';
import { ChatPanel, listMessages } from '@/features/chat';
import { FilePanel, listFiles } from '@/features/files';
import { getProject } from '@/features/projects';
import { SpecificationPanel, listSpecifications } from '@/features/specifications';

/**
 * Researcher page for one project: artifacts panel + Analyst chat.
 *
 * Mirrors `app/(app)/projects/[id]/page.tsx`. `params` is a Promise in Next 15.
 * `getProject` returns `null` for missing / deleted / foreign-owned — all three
 * map to `notFound()`, so existence is never leaked. `schemaName` is fetched
 * separately (it is an internal routing key not exposed on `ProjectView`) and
 * resolves the project's own schema for chat history, files, and specs.
 *
 * The artifacts `aside` composes two live client panels (`FilePanel`,
 * `SpecificationPanel`) and the static Roadmap card. Both panels are seeded
 * server-side via the list loaders so first paint is complete and they hydrate
 * without a client fetch — mirroring the `initialMessages` pattern on ChatPanel.
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

  const [messages, files, specs] = await Promise.all([
    listMessages(meta.schemaName),
    listFiles(meta.schemaName),
    listSpecifications(meta.schemaName),
  ]);

  return (
    <div className="flex h-full gap-4">
      <aside className="hidden w-1/5 shrink-0 flex-col gap-4 md:flex">
        <FilePanel initialFiles={files} projectId={id} />
        <SpecificationPanel initialSpecs={specs} projectId={id} />
        <Card interactive>
          <CardTitle>
            <Link href={`/projects/${id}/tasks`} className="block">
              Дорожная карта
            </Link>
          </CardTitle>
        </Card>
      </aside>
      <section className="flex-1">
        <ChatPanel initialMessages={messages} projectId={id} />
      </section>
    </div>
  );
}
