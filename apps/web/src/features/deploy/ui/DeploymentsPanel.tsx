'use client';

import { Button, Spinner } from '@aiflow/ui';

import { LocalDateTime } from '@/shared/ui';

import type { DeploymentDetail, DeploymentStatus, DeploymentSummary } from '../model/types';
import { useDeployments } from './useDeployments';

type Props = {
  projectId: string;
  canBuild: boolean;
  highlightId?: string | null;
};

const STATUS_STYLE: Record<DeploymentStatus, string> = {
  BUILDING: 'bg-amber-400',
  DEPLOYED: 'bg-emerald-500',
  FAILED: 'bg-red-500',
};

const STATUS_LABEL: Record<DeploymentStatus, string> = {
  BUILDING: 'Сборка',
  DEPLOYED: 'Готово',
  FAILED: 'Ошибка',
};

/**
 * Deployment history list with Pro «Собрать сейчас», log drawer, BUILDING poll.
 */
export function DeploymentsPanel({ projectId, canBuild, highlightId = null }: Props) {
  const s = useDeployments(projectId, highlightId, canBuild);

  if (s.loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (s.error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{s.error}</p>
        <Button type="button" variant="secondary" onClick={() => void s.refresh()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header canBuild={canBuild} s={s} />
      {s.items.length === 0 ? (
        <p className="text-sm text-fg-muted">Ещё не было сборок</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {s.items.map((item) => (
            <Row key={item.id} item={item} active={item.id === s.highlightId} onOpen={s.openLog} />
          ))}
        </ul>
      )}
      {s.expanded ? <LogDrawer detail={s.expanded} onClose={s.closeLog} /> : null}
      {s.toast ? <Toast message={s.toast} onClose={s.clearToast} /> : null}
    </div>
  );
}

function Header({ canBuild, s }: { canBuild: boolean; s: ReturnType<typeof useDeployments> }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Развёртывания</h1>
      {canBuild ? (
        <Button
          type="button"
          disabled={s.starting || s.building}
          onClick={() => void s.startBuild()}
        >
          {s.starting ? 'Запуск…' : 'Собрать сейчас'}
        </Button>
      ) : null}
    </div>
  );
}

function Row({
  item,
  active,
  onOpen,
}: {
  item: DeploymentSummary;
  active: boolean;
  onOpen: (id: string) => Promise<void>;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => void onOpen(item.id)}
        className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm hover:bg-surface-muted ${
          active ? 'bg-surface-muted' : ''
        }`}
      >
        <span
          className={`inline-block size-2.5 shrink-0 rounded-full ${STATUS_STYLE[item.status]}`}
          title={STATUS_LABEL[item.status]}
        />
        <span className="w-24 shrink-0 text-fg-muted">{STATUS_LABEL[item.status]}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.imageTag ?? '—'}</span>
        <span className="hidden truncate text-fg-muted sm:inline">{item.url ?? '—'}</span>
        <LocalDateTime value={item.createdAt} className="shrink-0 text-fg-muted" />
      </button>
    </li>
  );
}

function LogDrawer({ detail, onClose }: { detail: DeploymentDetail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" role="dialog">
      <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Лог сборки</h2>
          <button type="button" className="text-fg-muted" onClick={onClose}>
            ×
          </button>
        </div>
        <pre className="flex-1 overflow-auto p-4 font-mono text-xs whitespace-pre-wrap">
          {detail.log?.trim() ? detail.log : 'Лог пуст'}
        </pre>
      </div>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="fixed top-4 right-4 z-50 rounded-md border border-border bg-surface px-3 py-2 text-sm shadow"
    >
      {message}
      <button type="button" className="ml-2 text-fg-muted" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
