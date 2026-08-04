import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover feedback. For cards that are links or buttons. */
  interactive?: boolean;
  children?: ReactNode;
};

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-4',
        interactive && 'cursor-pointer transition-colors hover:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-fg-muted', className)} {...props} />;
}
