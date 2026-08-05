import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import { DeleteProjectButton } from './DeleteProjectButton';
import type { ProjectView } from '../model/types';

/**
 * The detail view for one project. A server component that renders the
 * project's metadata; the delete affordance is the only interactive piece, so
 * it is isolated in a client component (`DeleteProjectButton`).
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
