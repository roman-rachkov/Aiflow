'use client';

/**
 * Pro-mode audit event feed for a task (or project-wide when taskId omitted).
 */

import { Spinner } from '@aiflow/ui';

import type { AuditEventView } from '../model/types';
import { useAuditEvents } from './useAuditEvents';

type Props = {
  projectId: string;
  taskId?: string;
};

const ROLE_LABEL: Record<AuditEventView['actorRole'], string> = {
  CODER: 'Coder',
  REVIEWER: 'Reviewer',
  DEPLOYER: 'Deployer',
  SYSTEM: 'System',
};

/** Chronological list of significant role actions. */
export function AuditEventFeed({ projectId, taskId }: Props) {
  const { items, loading, error, refresh } = useAuditEvents(projectId, taskId);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-red-600">{error}</p>
        <button type="button" className="text-primary underline" onClick={() => void refresh()}>
          Повторить
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-xs text-fg-muted">Событий аудита пока нет.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">Аудит</h3>
      <ol className="space-y-2 border-l border-border pl-3">
        {items.map((ev) => (
          <AuditRow key={ev.id} event={ev} />
        ))}
      </ol>
    </div>
  );
}

function AuditRow({ event }: { event: AuditEventView }) {
  const when = new Date(event.createdAt).toLocaleString('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  const hash = event.afterHash ? shortHash(event.afterHash) : null;
  return (
    <li className="text-xs text-fg">
      <span className="text-fg-muted">{when}</span>
      {' · '}
      <span className="font-medium">{ROLE_LABEL[event.actorRole]}</span>
      {' · '}
      <span>{event.action}</span>
      {hash ? <span className="text-fg-muted"> · {hash}</span> : null}
      {metaHint(event.metadata) ? (
        <span className="text-fg-muted"> · {metaHint(event.metadata)}</span>
      ) : null}
    </li>
  );
}

function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 10)}…` : value;
}

function metaHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.verdict === 'string') return m.verdict;
  if (typeof m.status === 'string') return m.status;
  if (typeof m.branchName === 'string') return m.branchName;
  return null;
}
