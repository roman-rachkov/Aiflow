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
  children: ReactNode;
};

/**
 * Label + control + error message. Kept next to Input because every form in
 * the spec (§ 3–5) needs the same three parts, and hand-wiring the
 * label/error association is exactly where accessibility quietly breaks.
 *
 * Associates the label and error with the control via htmlFor/id and
 * aria-describedby: the control is cloned with a generated id, and the error
 * span (when present) is wired as the control's description so screen readers
 * announce it. The control should be a single form element like <Input/>.
 */
export function Field({ label, error, children }: FieldProps) {
  const reactId = useId();
  const controlId = `field-${reactId}`;
  const errorId = `${controlId}-error`;

  // Clone the single control element so we can inject id/aria-describedby
  // without forcing the consumer to pass them manually. If the child already
  // sets an id, it wins (consumers rarely do; the generated one is a default).
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
