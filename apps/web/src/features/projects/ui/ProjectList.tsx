import Link from 'next/link';

import { Card, CardTitle } from '@aiflow/ui';

import { ProjectCard } from './ProjectCard';
import type { ProjectView } from '../model/types';

/**
 * The dashboard project list. A server component: the parent page fetches the
 * projects and passes them in, keeping data access out of `app/` (routing
 * only) and out of the client bundle. The empty state is a prompt to create
 * the first project rather than a bare "nothing here".
 */
export function ProjectList({ projects }: { projects: ProjectView[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <p className="text-fg-muted">Пока нет проектов.</p>
        <Link
          href="/projects/new"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          Создать первый проект →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}

      <Link href="/projects/new" className="block">
        <Card interactive className="flex h-full items-center justify-center">
          <CardTitle className="text-fg-muted">＋ Создать проект</CardTitle>
        </Card>
      </Link>
    </div>
  );
}
