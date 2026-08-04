import { cn } from './lib/cn';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-4',
  lg: 'h-12 w-12 border-4',
} as const;

export type SpinnerProps = {
  size?: keyof typeof SIZES;
  className?: string;
  /** Screen-reader label. Set to null on decorative spinners beside visible text. */
  label?: string | null;
};

export function Spinner({ size = 'md', className, label = 'Загрузка' }: SpinnerProps) {
  return (
    <div
      role={label === null ? undefined : 'status'}
      aria-label={label ?? undefined}
      aria-hidden={label === null || undefined}
      className={cn(
        'animate-spin rounded-full border-primary border-t-transparent',
        SIZES[size],
        className,
      )}
    />
  );
}
