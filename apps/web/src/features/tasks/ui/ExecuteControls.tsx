'use client';

import { Button } from '@aiflow/ui';

import type { TaskStatus } from '../model/types';

type Props = {
  status: TaskStatus;
  busy: boolean;
  canExecute: boolean;
  onDryRun: () => void;
  onConfirm: () => void;
  onRun: () => void;
};

/** Pro controls: dry-run, confirm after dry-run, or direct run. */
export function ExecuteControls({ status, busy, canExecute, onDryRun, onConfirm, onRun }: Props) {
  if (!canExecute) return null;

  const canDry = status === 'PENDING' || status === 'FAILED' || status === 'AWAITING_REVIEW';
  const canConfirm = status === 'AWAITING_REVIEW';
  const canDirect = status === 'PENDING' || status === 'FAILED';

  return (
    <div className="flex flex-wrap gap-2">
      {canDry ? (
        <Button type="button" variant="secondary" disabled={busy} onClick={onDryRun}>
          Dry-run
        </Button>
      ) : null}
      {canConfirm ? (
        <Button type="button" disabled={busy} onClick={onConfirm}>
          Подтвердить
        </Button>
      ) : null}
      {canDirect ? (
        <Button type="button" variant="secondary" disabled={busy} onClick={onRun}>
          Запустить
        </Button>
      ) : null}
    </div>
  );
}
