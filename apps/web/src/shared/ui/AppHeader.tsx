/** App header: product mark on the left, whatever the caller passes on the right. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <span className="font-semibold tracking-tight">AI Studio</span>
      {children}
    </header>
  );
}
