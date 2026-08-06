import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import type { ProjectView } from '../model/types';

/**
 * One project in the list. The whole card opens Researcher (chat + files +
 * SPEC) — the Customer's main screen per docs/09-ui-spec.md § 4. Detail
 * (`/projects/[id]`) stays for metadata/delete via direct URL. `Card`'s
 * `interactive` flag adds the hover affordance. Server component: no client
 * interactivity needed.
 */
export function ProjectCard({ project }: { project: ProjectView }) {
  return (
    <Link href={`/projects/${project.id}/research`} className="block">
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
