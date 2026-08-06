'use client';

import { createPortal } from 'react-dom';

import { Button, Card, Field, Input } from '@aiflow/ui';

type ConfirmProps = {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
};

/** In-feature confirm overlay (same pattern as projects DeleteProjectButton). */
export function ConfirmDialog(props: ConfirmProps) {
  return createPortal(<ConfirmCard {...props} />, document.body);
}

function ConfirmCard({
  title,
  body,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Overlay onClose={pending ? undefined : onClose}>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-2 text-sm text-fg-muted">{body}</p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? '…' : confirmLabel}
        </Button>
      </div>
    </Overlay>
  );
}

type PromptProps = {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: (value: string) => void;
  onClose: () => void;
};

/** Prompt for create/rename path. */
export function PromptDialog(props: PromptProps) {
  return createPortal(<PromptCard {...props} />, document.body);
}

function PromptCard({
  title,
  label,
  initial,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: PromptProps) {
  return (
    <Overlay onClose={pending ? undefined : onClose}>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = new FormData(e.currentTarget).get('value');
          const value = typeof raw === 'string' ? raw.trim() : '';
          if (value) onConfirm(value);
        }}
      >
        <Field label={label}>
          <Input name="value" defaultValue={initial} autoFocus disabled={pending} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? '…' : confirmLabel}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: import('react').ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        onClose?.();
      }}
    >
      <Card
        className="w-full max-w-sm"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {children}
      </Card>
    </div>
  );
}
