/**
 * Public surface of @aiflow/ui.
 *
 * Primitives are OpenUI-backed wrappers (D0a) that keep a stable API for
 * apps/web. Tokens stay CSS-only (`@aiflow/ui/styles/theme.css`). App
 * composition (header, side menu, ThemeProvider) lives in
 * apps/web/src/shared/ui — it encodes this app's routes and brand theme.
 */

export { Button, type ButtonProps } from './Button';
export { Card, CardDescription, CardTitle, type CardProps } from './Card';
export { Field, Input, type FieldProps, type InputProps } from './Input';
export { Modal, type ModalProps } from './Modal';
export { Spinner, type SpinnerProps } from './Spinner';
export {
  ToastNotice,
  ToastProvider,
  useToast,
  type ToastNoticeProps,
  type ToastVariant,
} from './Toast';
export { cn } from './lib/cn';
