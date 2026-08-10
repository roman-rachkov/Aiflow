import { requireUser } from '@/features/auth';

/**
 * Full-bleed shell for project screens.
 *
 * Project screens (`/projects/[id]/*`) live in this route group so they get a
 * layout WITHOUT the top `AppHeader` and WITHOUT the padded/scrolling `<main>`
 * of `(app)`. The grown-up chat (`AgentInterface`) is itself the app shell — it
 * owns the full viewport (`100dvh`) and renders its own sidebar (threads +
 * project navigation). The global "Проекты" link lives in the chat sidebar, so
 * the horizontal top nav is intentionally absent here.
 *
 * The auth guard still runs (every project screen inherits it). Non-project
 * screens (sign-in, the projects list, new-project) stay in `(app)` and keep
 * the `AppHeader` + `<main>` chrome.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="h-screen w-screen overflow-hidden">{children}</div>;
}
