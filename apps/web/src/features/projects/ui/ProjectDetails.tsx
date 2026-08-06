import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import { DeleteProjectButton } from './DeleteProjectButton';
import type { ProjectView } from '../model/types';

/**
 * The detail view for one project. A server component that renders the
 * project's metadata; the delete affordance is the only interactive piece, so
 * it is isolated in a client component (`DeleteProjectButton`).
 *
 * The primary CTA opens Researcher (`/research`) — chat, files, SPEC — which
 * is the Customer's main screen (docs/09-ui-spec.md § 4). Without this link
 * the page looks like a dead end: name + delete and nothing else.
 *
 * Dates are formatted in Russian per the product language policy
 * (user-facing output in the user's language — CLAUDE.md).
 */
export function ProjectDetails({ project }: { project: ProjectView }) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Создан {project.createdAt.toLocaleDateString('ru-RU')}
          </p>
        </div>
        <DeleteProjectButton projectId={project.id} />
      </div>

      <div className="mt-6">
        <Link
          href={`/projects/${project.id}/research`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-hidden"
        >
          Открыть исследование
        </Link>
      </div>

      <Card className="mt-6">
        <CardTitle>Описание</CardTitle>
        {project.description ? (
          <CardDescription className="mt-2 whitespace-pre-wrap">
            {project.description}
          </CardDescription>
        ) : (
          <CardDescription className="mt-2">Нет описания</CardDescription>
        )}
      </Card>
    </div>
  );
}
