import { notFound } from 'next/navigation';

import { getPublicClient } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import { listMessages } from '@/features/chat';
import { listFiles } from '@/features/files';
import { getProject } from '@/features/projects';
import { listSpecifications } from '@/features/specifications';

import { ResearchWorkspace } from './ResearchWorkspace';

/**
 * Researcher page: three-column workspace (artifacts | chat | SPEC preview).
 *
 * Wiring only — auth, ownership, SSR seeds. Interactive layout and SPEC state
 * live in ResearchWorkspace.
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
    <ResearchWorkspace
      projectId={id}
      projectName={project.name}
      initialMessages={messages}
      initialFiles={files}
      initialSpecs={specs}
    />
  );
}
