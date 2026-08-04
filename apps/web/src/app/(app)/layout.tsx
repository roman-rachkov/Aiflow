import { UserBadge, requireUser } from '@/features/auth';
import { AppHeader, SideMenu } from '@/shared/ui';

/**
 * Shell for every authenticated screen. The guard runs here so each page under
 * `(app)` inherits it — a page that forgets to call it is still protected.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader>
        <UserBadge email={user.email} name={user.name} />
      </AppHeader>
      <div className="flex flex-1">
        <SideMenu />
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
