import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, letting later Tailwind utilities win over earlier ones.
 *
 * `clsx` resolves conditionals and arrays; `twMerge` then drops classes that
 * conflict, so a caller's `className` can override a component's default
 * (`<Button className="bg-danger">` beats the variant's `bg-primary`) instead
 * of the outcome depending on CSS source order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
