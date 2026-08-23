'use client';

import type { ReactNode } from 'react';

import { Button, Spinner } from '@aiflow/ui';

import { TaskRow } from './TaskRow';
import { useTasks } from './useTasks';

type Props = {
  projectId: string;
  projectName: string;
  canPlan: boolean;
  /** Optional Pro extras under a selected task (e.g. audit feed from app/). */
  renderTaskExtras?: (taskId: string) => ReactNode;
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
    <TasksBody
      projectId={projectId}
      projectName={projectName}
      canPlan={canPlan}
      s={s}
      renderTaskExtras={renderTaskExtras}
    />
  );
}

function TasksBody({
  projectId,
  projectName,
  canPlan,
  s,
  renderTaskExtras,
}: Props & { s: ReturnType<typeof useTasks> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <Header projectName={projectName} canPlan={canPlan} s={s} />
      <TaskList projectId={projectId} canPlan={canPlan} s={s} renderTaskExtras={renderTaskExtras} />
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

function TaskList({
  projectId,
  canPlan,
  s,
  renderTaskExtras,
}: {
  projectId: string;
  canPlan: boolean;
  s: ReturnType<typeof useTasks>;
  renderTaskExtras?: (taskId: string) => ReactNode;
}) {
  if (s.items.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        Задач пока нет. Утвердите SPEC и нажмите «Сгенерировать план».
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {s.items.map((item) => (
        <TaskRow
          key={item.id}
          item={item}
          projectId={projectId}
          canPlan={canPlan}
          s={s}
          extras={s.selected?.id === item.id && renderTaskExtras ? renderTaskExtras(item.id) : null}
        />
      ))}
    </ul>
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
