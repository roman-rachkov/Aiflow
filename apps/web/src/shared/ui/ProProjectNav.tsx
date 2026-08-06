'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Project-scoped nav links when the path is under `/projects/[id]`.
 * Deployments: all owners. Model settings: Pro only.
 */
export function ProProjectNav({ isPro }: { isPro: boolean }) {
  const pathname = usePathname();
  const match = /^\/projects\/([^/]+)/.exec(pathname);
  if (!match || match[1] === 'new') return null;
  const projectId = match[1];

  return (
    <>
      <li>
        <Link
          href={`/projects/${projectId}/deployments`}
          className="block rounded-md px-3 py-2 text-sm text-fg hover:bg-surface-muted"
        >
          Развёртывания
        </Link>
      </li>
      {isPro ? (
        <li>
          <Link
            href={`/projects/${projectId}/settings/models`}
            className="block rounded-md px-3 py-2 text-sm text-fg hover:bg-surface-muted"
          >
            Настройки модели
          </Link>
        </li>
      ) : null}
    </>
  );
}
