import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from './lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Renders the invalid state and sets aria-invalid for assistive tech. */
  invalid?: boolean;
};

// forwardRef: form libraries (react-hook-form, formik) register the field by ref.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'h-10 w-full rounded-md border bg-surface px-3 py-2 text-fg placeholder:text-fg-muted',
        'focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-hidden',
        'disabled:cursor-not-allowed disabled:bg-surface-muted',
        invalid ? 'border-danger' : 'border-border',
        className,
      )}
      {...props}
    />
  );
});

export type FieldProps = {
  label: string;
  /** Announced via aria-describedby and rendered below the control. */
  error?: string;
  children: React.ReactNode;
};

/**
 * Label + control + error message. Kept next to Input because every form in
 * the spec (§ 3–5) needs the same three parts, and hand-wiring the
 * label/error association is exactly where accessibility quietly breaks.
 */
export function Field({ label, error, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {error !== undefined && (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
