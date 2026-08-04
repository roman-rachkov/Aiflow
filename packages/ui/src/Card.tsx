import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from './lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover feedback. For cards that are links or buttons. */
  interactive?: boolean;
  children?: ReactNode;
};

// forwardRef so consumers can measure/layout the card (ResizeObserver, etc.).
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-surface p-4',
        interactive && 'cursor-pointer transition-colors hover:border-primary',
        className,
      )}
      {...props}
    />
  );
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={cn('text-base font-semibold text-fg', className)} {...props} />;
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-fg-muted', className)} {...props} />;
});
