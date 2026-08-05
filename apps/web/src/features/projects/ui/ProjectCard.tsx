import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import type { ProjectView } from '../model/types';

/**
 * One project in the list. The whole card is a link to the project's detail
 * page — `Card`'s `interactive` flag adds the hover affordance for exactly
 * this shape. A server component: no client interactivity needed.
 */
export function ProjectCard({ project }: { project: ProjectView }) {
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card interactive>
        <CardTitle>{project.name}</CardTitle>
        {project.description ? (
          <CardDescription>{project.description}</CardDescription>
        ) : (
          <CardDescription>Нет описания</CardDescription>
        )}
      </Card>
    </Link>
  );
}
