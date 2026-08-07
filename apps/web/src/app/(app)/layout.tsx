import { UserBadge, requireUser } from '@/features/auth';
import { AppHeader, AppNav } from '@/shared/ui';

/**
 * Shell for every authenticated screen. The guard runs here so each page under
 * `(app)` inherits it — a page that forgets to call it is still protected.
 *
 * Height is capped to the viewport (`h-screen` + `overflow-hidden`) so nested
 * screens like Researcher can scroll internally instead of stretching the page.
 * Navigation is horizontal in the header (no sidebar column).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader nav={<AppNav isPro={user.uiMode === 'PRO'} />}>
        <UserBadge email={user.email} name={user.name} />
      </AppHeader>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 md:px-6 md:py-4">
        {children}
      </main>
    </div>
  );
}
