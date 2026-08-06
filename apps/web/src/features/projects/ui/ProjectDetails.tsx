import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import { DeleteProjectButton } from './DeleteProjectButton';
import type { ProjectView } from '../model/types';

type Props = {
  project: ProjectView;
  /** When true, show the Pro-only code editor entry. */
  showEditorLink?: boolean;
};

/**
 * The detail view for one project. A server component that renders the
 * project's metadata; the delete affordance is the only interactive piece, so
 * it is isolated in a client component (`DeleteProjectButton`).
 *
 * Primary CTAs: Researcher (all users) and Code Editor (Pro only).
 */
export function ProjectDetails({ project, showEditorLink = false }: Props) {
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

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/projects/${project.id}/research`}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-hidden"
        >
          Открыть исследование
        </Link>
        {showEditorLink ? (
          <Link
            href={`/projects/${project.id}/editor`}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-hidden"
          >
            Редактор кода
          </Link>
        ) : null}
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
