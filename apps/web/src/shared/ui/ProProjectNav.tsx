'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Pro-only project-scoped nav. Reads the project id from the current path so
 * SideMenu can stay free of route params. Hidden for BASIC and outside projects.
 */
export function ProProjectNav({ isPro }: { isPro: boolean }) {
  const pathname = usePathname();
  if (!isPro) return null;

  const match = /^\/projects\/([^/]+)/.exec(pathname);
  if (!match || match[1] === 'new') return null;
  const projectId = match[1];

  return (
    <li>
      <Link
        href={`/projects/${projectId}/settings/models`}
        className="block rounded-md px-3 py-2 text-sm text-fg hover:bg-surface-muted"
      >
        Настройки модели
      </Link>
    </li>
  );
}
