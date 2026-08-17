import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import { DeleteProjectButton } from './DeleteProjectButton';
import type { ProjectView } from '../model/types';

/**
 * One project in the list. The card body opens the project shell; delete sits
 * outside the link so the confirm dialog does not navigate away. Delete is a
 * client island (`DeleteProjectButton`); the rest stays a server component.
 */
export function ProjectCard({ project }: { project: ProjectView }) {
  return (
    <div className="relative">
      <Link href={`/projects/${project.id}`} className="block">
        <Card interactive className="pr-24">
          <CardTitle>{project.name}</CardTitle>
          {project.description ? (
            <CardDescription>{project.description}</CardDescription>
          ) : (
            <CardDescription>Нет описания</CardDescription>
          )}
        </Card>
      </Link>
      <div className="absolute top-3 right-3">
        <DeleteProjectButton projectId={project.id} />
      </div>
    </div>
  );
}
