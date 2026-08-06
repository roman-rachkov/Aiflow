'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, Card } from '@aiflow/ui';

/**
 * Delete affordance with an in-system confirmation dialog. The overlay lives
 * in this feature slice, not as a `@aiflow/ui` primitive: by decision D0
 * (docs/14-decisions-needed.md) and conventions §2.3 a component with one
 * consumer stays out of the shared package. Built from `Button`/`Card` and
 * the semantic tokens, rendered via `createPortal`. When a second consumer
 * appears this becomes the promotion case for a shared `Modal`.
 *
 * Delete is soft-delete: the API sets `deletedAt`, the schema is retained.
 */
export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Удалить
      </Button>
      {open && (
        <ConfirmDialog
          projectId={projectId}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

/** State for a confirm-then-delete interaction. */
function useConfirmDelete(projectId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });

      if (response.ok) {
        // Soft-delete is instant in the DB; a long wait is almost always
        // Next.js compiling the route on first hit (cold start in compose).
        // refresh() forces the list RSC to re-fetch so the row disappears.
        router.push('/projects');
        router.refresh();
        return;
      }

      const { error: message } = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(message ?? 'Не удалось удалить проект. Попробуйте ещё раз.');
    } catch {
      setError('Не удалось удалить проект. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return { pending, error, confirm };
}

/** The confirmation overlay, split out to keep each part under 50 lines. */
function ConfirmDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { pending, error, confirm } = useConfirmDelete(projectId);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <Card
        className="w-full max-w-sm"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="text-lg font-semibold text-fg">Удалить проект?</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Проект будет удалён. Это действие нельзя отменить.
        </p>

        {error !== null && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void confirm();
            }}
            disabled={pending}
          >
            {pending ? 'Удаление…' : 'Удалить безвозвратно'}
          </Button>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
