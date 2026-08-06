/**
 * Card — OpenUI Card plus local title/description helpers.
 *
 * Per-component OpenUI entry (not the package barrel — see Button.tsx). CardTitle
 * / CardDescription stay local: OpenUI's CardHeader is a different composition.
 */
'use client';

import { Card as OpenUiCard } from '@openuidev/react-ui/Card';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from './lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Adds hover feedback. For cards that are links or buttons. */
  interactive?: boolean;
  children?: ReactNode;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <OpenUiCard
      ref={ref}
      variant="card"
      className={cn(
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
