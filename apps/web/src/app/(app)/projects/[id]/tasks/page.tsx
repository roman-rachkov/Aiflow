import { notFound } from 'next/navigation';

import { requireUser } from '@/features/auth';
import { getProject } from '@/features/projects';
import { TasksPanel } from '@/features/tasks/client';

/**
 * Roadmap / tasks page — list + Pro «Сгенерировать план» (Task 3.2).
 */
export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProject(id, user.id);
  if (!project) notFound();

  return <TasksPanel projectId={id} projectName={project.name} canPlan={user.uiMode === 'PRO'} />;
}
