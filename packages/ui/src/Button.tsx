/**
 * Button — thin wrapper over OpenUI's Button.
 *
 * Imports the per-component entry (`/Button`), not the package barrel: OpenUI's
 * main index is `"use client"` + `export *`, which Next.js rejects as a client
 * boundary. Keeps the @aiflow/ui public API (variant/size names).
 */
'use client';

import {
  Button as OpenUiButton,
  type ButtonProps as OpenUiButtonProps,
} from '@openuidev/react-ui/Button';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from './lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
};

const SIZE: Record<Size, NonNullable<OpenUiButtonProps['size']>> = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  const openVariant: OpenUiButtonProps['variant'] =
    variant === 'ghost' ? 'tertiary' : variant === 'danger' ? 'primary' : variant;
  const buttonType: OpenUiButtonProps['buttonType'] =
    variant === 'danger' ? 'destructive' : 'normal';

  return (
    <OpenUiButton
      ref={ref}
      type={type}
      variant={openVariant}
      size={SIZE[size]}
      buttonType={buttonType}
      className={cn(className)}
      {...props}
    />
  );
});
