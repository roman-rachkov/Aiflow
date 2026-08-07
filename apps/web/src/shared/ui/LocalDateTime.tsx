'use client';

/**
 * Locale date/time for SSR Client Components.
 *
 * `Intl` / `toLocaleString` use the host timezone, so Docker (UTC) and the
 * browser (user TZ) disagree and React hydration fails. `suppressHydrationWarning`
 * is the documented escape hatch for this intentional mismatch.
 */
type Props = {
  value: Date | string;
  className?: string;
};

export function LocalDateTime({ value, className }: Props) {
  const text = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
  return (
    <span className={className} suppressHydrationWarning>
      {text}
    </span>
  );
}
