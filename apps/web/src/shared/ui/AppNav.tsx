'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Horizontal primary navigation for the app header.
 *
 * Replaces the former SideMenu column. Global link: Projects. Under a project
 * path: Researcher, Tasks, Deployments; Pro adds Editor and Model settings.
 */

const linkClass = (active: boolean) =>
  [
    'rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap',
    active
      ? 'bg-surface-muted font-medium text-fg'
      : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  ].join(' ');

export function AppNav({ isPro = false }: { isPro?: boolean }) {
  const pathname = usePathname();
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  const projectId = match && match[1] !== 'new' ? match[1] : null;
  const base = projectId ? `/projects/${projectId}` : null;

  return (
    <nav
      aria-label="Основная навигация"
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      <Link href="/projects" className={linkClass(pathname === '/projects' || pathname === '/')}>
        Проекты
      </Link>
      {base ? <ProjectLinks base={base} pathname={pathname} isPro={isPro} /> : null}
    </nav>
  );
}

function ProjectLinks({
  base,
  pathname,
  isPro,
}: {
  base: string;
  pathname: string;
  isPro: boolean;
}) {
  return (
    <>
      <Link
        href={`${base}/research`}
        className={linkClass(pathname.startsWith(`${base}/research`))}
      >
        Исследование
      </Link>
      <Link href={`${base}/tasks`} className={linkClass(pathname.startsWith(`${base}/tasks`))}>
        Задачи
      </Link>
      <Link
        href={`${base}/deployments`}
        className={linkClass(pathname.startsWith(`${base}/deployments`))}
      >
        Развёртывания
      </Link>
      {isPro ? (
        <>
          <Link
            href={`${base}/editor`}
            className={linkClass(pathname.startsWith(`${base}/editor`))}
          >
            Редактор
          </Link>
          <Link
            href={`${base}/settings/models`}
            className={linkClass(pathname.startsWith(`${base}/settings/models`))}
          >
            Модели
          </Link>
        </>
      ) : null}
    </>
  );
}
