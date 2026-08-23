'use client';

import type { ReactNode } from 'react';

import { Button, Spinner } from '@aiflow/ui';

import type { TaskPriority, TaskStatus, TaskSummary } from '../model/types';
import { ExecuteControls } from './ExecuteControls';
import { parseLatestReview } from './parse-review';
import { ReviewVerdictCard } from './ReviewVerdictCard';
import { TaskLogPanel } from './TaskLogPanel';
import { useTasks } from './useTasks';

type Props = {
  projectId: string;
  projectName: string;
  canPlan: boolean;
  /** Optional Pro extras under a selected task (e.g. audit feed from app/). */
  renderTaskExtras?: (taskId: string) => ReactNode;
};

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

/** Roadmap list with plan + coder execute controls (Tasks 3.2–3.3 + 4.1). */
export function TasksPanel({ projectId, projectName, canPlan, renderTaskExtras }: Props) {
  const s = useTasks(projectId, canPlan);

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
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <Header projectName={projectName} canPlan={canPlan} s={s} />
      {s.items.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Задач пока нет. Утвердите SPEC и нажмите «Сгенерировать план».
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {s.items.map((item) => (
            <TaskRow
              key={item.id}
              item={item}
              projectId={projectId}
              canPlan={canPlan}
              s={s}
              extras={
                s.selected?.id === item.id && renderTaskExtras
                  ? renderTaskExtras(item.id)
                  : null
              }
            />
          ))}
        </ul>
      )}
      {s.toast ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm" role="status">
          {s.toast}{' '}
          <button type="button" className="text-primary underline" onClick={s.clearToast}>
            Скрыть
          </button>
        </p>
      ) : null}
    </div>
  );
}

function Header({
  projectName,
  canPlan,
  s,
}: {
  projectName: string;
  canPlan: boolean;
  s: ReturnType<typeof useTasks>;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Задачи · {projectName}</h1>
      {canPlan ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={s.planning} onClick={() => void s.generatePlan()}>
            {s.planning ? 'Запуск…' : 'Сгенерировать план'}
          </Button>
          {s.items.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={s.planning}
              onClick={() => void s.runPlan()}
            >
              Запустить план
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  item,
  projectId,
  canPlan,
  s,
  extras,
}: {
  item: TaskSummary;
  projectId: string;
  canPlan: boolean;
  s: ReturnType<typeof useTasks>;
  extras?: ReactNode;
}) {
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          className="text-left text-sm font-medium text-fg hover:underline"
          onClick={() => void s.selectTask(selected ? null : item.id)}
        >
          {item.title}
        </button>
        <span className="text-xs text-fg-muted">
          {STATUS_LABEL[item.status]} · {PRIORITY_LABEL[item.priority]}
        </span>
      </div>
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
