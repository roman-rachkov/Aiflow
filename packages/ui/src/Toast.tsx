'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from './lib/cn';

export type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = { id: string; message: string; variant: ToastVariant };

type CtxValue = {
  addToast: (opts: { message: string; variant?: ToastVariant }) => void;
};

const ToastCtx = createContext<CtxValue | null>(null);

const DISMISS_MS = 4000;

const VARIANT_CLS: Record<ToastVariant, string> = {
  success: 'border-success text-success',
  error: 'border-danger text-danger',
  info: 'border-border text-fg',
};

/** Standalone toast for one-off messages (no provider required). */
export type ToastNoticeProps = {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
  className?: string;
};

export function ToastNotice({ message, variant = 'info', onClose, className }: ToastNoticeProps) {
  return (
    <div
      role="status"
      className={cn(
        'fixed top-4 right-4 z-50 flex items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-md',
        VARIANT_CLS[variant],
        className,
      )}
    >
      <span className="flex-1">{message}</span>
      {onClose ? (
        <button
          type="button"
          aria-label="Закрыть"
          className="shrink-0 text-fg-muted hover:text-fg"
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Call inside a ToastProvider to push toast notifications. */
export function useToast(): CtxValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be called inside ToastProvider');
  return ctx;
}

/** Wraps a subtree to enable toast notifications via useToast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    ({ message, variant = 'info' }: { message: string; variant?: ToastVariant }) => {
      const id = Math.random().toString(36).slice(2, 9);
      setItems((prev) => [...prev, { id, message, variant }]);
      timers.current.set(
        id,
        setTimeout(() => {
          dismiss(id);
        }, DISMISS_MS),
      );
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ addToast }}>
      {children}
      <ToastList items={items} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

function ToastList({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || items.length === 0) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-md',
        VARIANT_CLS[item.variant],
      )}
    >
      <span className="flex-1">{item.message}</span>
      <button
        type="button"
        aria-label="Закрыть"
        className="shrink-0 text-fg-muted hover:text-fg"
        onClick={() => {
          onDismiss(item.id);
        }}
      >
        ×
      </button>
    </div>
  );
}
