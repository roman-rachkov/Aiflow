import { type VariantProps, cva } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from './lib/cn';

const button = cva(
  // Shared: focus-visible rather than focus, so keyboard users get the ring and
  // mouse users do not. disabled styling lives here because it never varies.
  'inline-flex items-center justify-center rounded-md font-medium transition-colors ' +
    'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary hover:bg-primary-hover text-white',
        secondary: 'border-border bg-surface text-fg hover:bg-surface-muted border',
        ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        danger: 'bg-danger text-white hover:bg-danger-hover',
      },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-sm',
        md: 'h-10 gap-2 px-4 text-sm',
        lg: 'h-11 gap-2 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { children?: ReactNode };

// forwardRef so consumers can focus the button (command menus, form submit on
// Enter, etc.) and libraries like react-hook-form can drive it.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = 'button', ...props },
  ref,
) {
  // Default type="button": an untyped <button> submits its form, which is a
  // real bug every time it is not what was meant.
  return (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
  );
});
