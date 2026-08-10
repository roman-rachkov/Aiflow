import { notFound } from 'next/navigation';

import { getPublicClient } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import { listFiles } from '@/features/files';
import { getProject } from '@/features/projects';
import { listSpecifications } from '@/features/specifications';

import { ProjectShell } from './_shell/ProjectShell';
import type { FileListItemView } from '@/features/files';
import type { SpecificationListItemView } from '@/features/specifications';

/**
 * Project home — the grown-up chat shell (`AgentInterface`) is the home of a
 * project. Threads, files, tasks, deploy, SPEC, and model settings live as
 * sidebar routes inside the shell; the chat is the default view.
 *
 * SSR-seeds the data the shell's routes need for a correct first paint: the
 * file list (`FilePanel` requires `initialFiles`) and the SPEC versions. Other
 * panels (tasks, deploy, models) self-load client-side.
 */
export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);
  if (!project) notFound();

  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id },
    select: { schemaName: true },
  });
  if (!meta) notFound();

  const [files, specs] = await Promise.all([
    listFiles(meta.schemaName),
    listSpecifications(meta.schemaName),
  ]);

  return (
    <ProjectShell
      projectId={id}
      projectName={project.name}
      isPro={user.uiMode === 'PRO'}
      initialFiles={files}
      initialSpecs={specs}
    />
  );
}

// Re-export the view types for the shell's prop signature (kept here so the
// page owns the SSR contract; the shell stays a pure client component).
export type { FileListItemView, SpecificationListItemView };
