'use client';

/**
 * One roadmap row: status, execute controls, optional review + log + extras.
 */

import type { ReactNode } from 'react';

import type { TaskPriority, TaskStatus, TaskSummary } from '../model/types';
import { ExecuteControls } from './ExecuteControls';
import { parseLatestReview } from './parse-review';
import { ReviewVerdictCard } from './ReviewVerdictCard';
import { TaskLogPanel } from './TaskLogPanel';
import type { useTasks } from './useTasks';

const STATUS_LABEL: Record<TaskStatus, string> = {
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  AWAITING_REVIEW: 'Ожидает подтверждения',
  DONE: 'Готово',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменена',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  CRITICAL: 'Критичный',
  HIGH: 'Высокий',
  MEDIUM: 'Средний',
  LOW: 'Низкий',
};

type Props = {
  item: TaskSummary;
  projectId: string;
  canPlan: boolean;
  s: ReturnType<typeof useTasks>;
  extras?: ReactNode;
};

/** Single task row in the roadmap list. */
export function TaskRow({ item, projectId, canPlan, s, extras }: Props) {
  const deps =
    item.dependencyTitles.length > 0
      ? `Зависит от: ${item.dependencyTitles.join(', ')}`
      : 'Без зависимостей';
  const selected = s.selected?.id === item.id;
  const seed = selected && s.selected ? s.selected.logs.map((l) => l.message).join('') : '';
  const live = item.status === 'IN_PROGRESS';
  const review = seed ? parseLatestReview(seed) : null;

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <RowHeader
        title={item.title}
        status={item.status}
        priority={item.priority}
        onToggle={() => void s.selectTask(selected ? null : item.id)}
      />
      <p className="text-xs text-fg-muted">{deps}</p>
      <ExecuteControls
        status={item.status}
        busy={s.executingId === item.id}
        canExecute={canPlan}
        onDryRun={() => void s.dryRun(item.id)}
        onConfirm={() => void s.confirm(item.id)}
        onRun={() => void s.runLive(item.id)}
      />
      {review ? <ReviewVerdictCard review={review} /> : null}
      {selected || live ? (
        <TaskLogPanel projectId={projectId} taskId={item.id} active={live} seed={seed} />
      ) : null}
      {extras}
    </li>
  );
}

function RowHeader({
  title,
  status,
  priority,
  onToggle,
}: {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <button
        type="button"
        className="text-left text-sm font-medium text-fg hover:underline"
        onClick={onToggle}
      >
        {title}
      </button>
      <span className="text-xs text-fg-muted">
        {STATUS_LABEL[status]} · {PRIORITY_LABEL[priority]}
      </span>
    </div>
  );
}
