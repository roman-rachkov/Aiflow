import Link from 'next/link';

import { Card, CardDescription, CardTitle } from '@aiflow/ui';

import { DeleteProjectButton } from './DeleteProjectButton';
import type { ProjectView } from '../model/types';

type Props = {
  project: ProjectView;
  /** When true, show Pro-only entries (editor, model settings). */
  showProLinks?: boolean;
};

/**
 * Detail view for one project. Delete is the only interactive piece
 * (`DeleteProjectButton`). CTAs: Researcher (all); Editor + Models (Pro).
 */
export function ProjectDetails({ project, showProLinks = false }: Props) {
  return (
    <div className="max-w-2xl">
      <ProjectHeader project={project} />
      <ProjectActionLinks projectId={project.id} showProLinks={showProLinks} />
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

function ProjectHeader({ project }: { project: ProjectView }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Создан {project.createdAt.toLocaleDateString('ru-RU')}
        </p>
      </div>
      <DeleteProjectButton projectId={project.id} />
    </div>
  );
}

const linkClass =
  'inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-hidden';

function ProjectActionLinks({
  projectId,
  showProLinks,
}: {
  projectId: string;
  showProLinks: boolean;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href={`/projects/${projectId}/research`}
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-hidden"
      >
        Открыть исследование
      </Link>
      <Link href={`/projects/${projectId}/deployments`} className={linkClass}>
        Развёртывания
      </Link>
      {showProLinks ? (
        <>
          <Link href={`/projects/${projectId}/editor`} className={linkClass}>
            Редактор кода
          </Link>
          <Link href={`/projects/${projectId}/settings/models`} className={linkClass}>
            Настройки модели
          </Link>
        </>
      ) : null}
    </div>
  );
}
