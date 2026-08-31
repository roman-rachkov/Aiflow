'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Modal } from '@aiflow/ui';

/**
 * Delete affordance with a shared Modal confirmation. Soft-delete via API
 * (`deletedAt`); schema is retained.
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
      <ConfirmDialog
        projectId={projectId}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
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

function ConfirmDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { pending, error, confirm } = useConfirmDelete(projectId);

  return (
    <Modal open={open} title="Удалить проект?" onClose={pending ? () => {} : onClose}>
      <p className="text-sm text-fg-muted">Проект будет удалён. Это действие нельзя отменить.</p>

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
    </Modal>
  );
}
