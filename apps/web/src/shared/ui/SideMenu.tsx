import Link from 'next/link';

/**
 * Primary navigation. Lives in `shared/ui` rather than in a feature slice: the
 * header is not authentication, and putting it there pushed the auth slice past
 * the 400-line budget in docs/15-engineering-conventions.md § 5.5.
 *
 * Destinations beyond the dashboard arrive with their own tasks; they are
 * listed now so the shell is not visibly empty.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Проекты' },
  { href: '/deployments', label: 'Развёртывания' },
] as const;

export function SideMenu() {
  return (
    <nav className="w-52 shrink-0 border-r border-border px-4 py-6">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm text-fg hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
