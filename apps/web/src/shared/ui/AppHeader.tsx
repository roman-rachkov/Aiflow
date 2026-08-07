/**
 * App header: product mark, horizontal nav (center), caller slot on the right
 * (typically UserBadge).
 */
export function AppHeader({
  nav,
  children,
}: {
  nav?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-2.5 md:px-6">
      <span className="shrink-0 font-semibold tracking-tight">AI Studio</span>
      {nav}
      <div className="ml-auto shrink-0">{children}</div>
    </header>
  );
}
