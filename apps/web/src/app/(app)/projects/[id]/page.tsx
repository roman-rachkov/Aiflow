import { notFound } from 'next/navigation';

import { requireUser } from '@/features/auth';
import { getProject, ProjectDetails } from '@/features/projects';

/**
 * Detail page for one project. `params` is a Promise in Next 15 (App Router).
 * `getProject` returns `null` for missing, deleted, or foreign-owned projects
 * alike — all three map to `notFound()`, so no project's existence is leaked.
 */
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);

  if (!project) notFound();

  return <ProjectDetails project={project} />;
}
