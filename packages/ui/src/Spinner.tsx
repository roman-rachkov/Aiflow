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

export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  // Decorative when there is no label (null/undefined): hide from AT and drop
  // the status role. Otherwise announce it. The previous `label === null ||
  // undefined` never evaluated to true for `undefined`, so a label-less spinner
  // advertised itself as a status while also being aria-hidden — contradictory.
  const decorative = label == null;
  return (
    <div
      role={decorative ? undefined : 'status'}
      aria-label={label ?? undefined}
      aria-hidden={decorative || undefined}
      className={cn(
        'animate-spin rounded-full border-primary border-t-transparent',
        SIZES[size],
        className,
      )}
    />
  );
}
