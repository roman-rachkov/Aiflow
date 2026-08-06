/**
 * Input + Field — OpenUI Input with the existing Field accessibility wrapper.
 *
 * Per-component OpenUI entry (not the package barrel — see Button.tsx).
 * `invalid` maps to OpenUI's `hasError`.
 */
'use client';

import { Input as OpenUiInput } from '@openuidev/react-ui/Input';
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from './lib/cn';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Renders the invalid state and sets aria-invalid for assistive tech. */
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <OpenUiInput
      ref={ref}
      aria-invalid={invalid || undefined}
      hasError={invalid}
      className={cn('w-full', className)}
      {...props}
    />
  );
});

export type FieldProps = {
  label: string;
  /** Announced via aria-describedby and rendered below the control. */
  error?: string;
  children: ReactNode;
};

/**
 * Label + control + error message. Associates the label and error with the
 * control via htmlFor/id and aria-describedby.
 */
export function Field({ label, error, children }: FieldProps) {
  const reactId = useId();
  const controlId = `field-${reactId}`;
  const errorId = `${controlId}-error`;

  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
        id: (child.props as { id?: string }).id ?? controlId,
        'aria-describedby':
          error !== undefined
            ? ((child.props as { 'aria-describedby'?: string })['aria-describedby'] ?? errorId)
            : (child.props as { 'aria-describedby'?: string })['aria-describedby'],
      })
    : child;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={controlId} className="text-sm font-medium text-fg">
        {label}
      </label>
      {control}
      {error !== undefined && (
        <span id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
