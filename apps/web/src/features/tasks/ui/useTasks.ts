'use client';

import { useCallback, useEffect, useState } from 'react';

import type { TaskDetail, TaskSummary } from '../model/types';
import { postCode, postPlan } from './task-api';

export type UseTasksResult = {
  items: TaskSummary[];
  loading: boolean;
  error: string | null;
  planning: boolean;
  executingId: string | null;
  toast: string | null;
  selected: TaskDetail | null;
  refresh: () => Promise<void>;
  generatePlan: () => Promise<void>;
  dryRun: (taskId: string) => Promise<void>;
  confirm: (taskId: string) => Promise<void>;
  runLive: (taskId: string) => Promise<void>;
  selectTask: (taskId: string | null) => Promise<void>;
  clearToast: () => void;
};

/** List tasks + plan/code enqueue + poll while work is in flight. */
export function useTasks(projectId: string, canPlan: boolean): UseTasksResult {
  const list = useTaskList(projectId);
  const plan = usePlanActions(projectId, canPlan, list.refresh);
  const code = useCodeActions(projectId, canPlan, list.refresh);

  return {
    ...list,
    planning: plan.planning,
    executingId: code.executingId,
    toast: plan.toast ?? code.toast,
    selected: code.selected,
    generatePlan: plan.generatePlan,
    dryRun: code.dryRun,
    confirm: code.confirm,
    runLive: code.runLive,
    selectTask: code.selectTask,
    clearToast: () => {
      plan.clearToast();
      code.clearToast();
    },
  };
}

function useTaskList(projectId: string) {
  const [items, setItems] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Не удалось загрузить задачи');
      }
      setItems((await res.json()) as TaskSummary[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}

function usePlanActions(projectId: string, canPlan: boolean, refresh: () => Promise<void>) {
  const [planning, setPlanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  usePollWhile(planning, refresh);

  const generatePlan = useCallback(async () => {
    if (!canPlan || planning) return;
    setPlanning(true);
    try {
      const result = await postPlan(projectId);
      setToast(result.toast);
      if (result.ok) await refresh();
    } finally {
      setPlanning(false);
    }
  }, [canPlan, planning, projectId, refresh]);

  return {
    planning,
    toast,
    generatePlan,
    clearToast: () => {
      setToast(null);
    },
  };
}

function useCodeActions(projectId: string, canPlan: boolean, refresh: () => Promise<void>) {
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<TaskDetail | null>(null);
  usePollWhile(executingId != null, refresh);

  const runAction = useCallback(
    async (taskId: string, action: 'dry' | 'confirm' | 'run') => {
      if (!canPlan || executingId) return;
      setExecutingId(taskId);
      try {
        const result = await postCode(projectId, taskId, action);
        setToast(result.toast);
        if (result.ok) {
          await refresh();
          await loadDetail(projectId, taskId, setSelected);
        }
      } finally {
        setExecutingId(null);
      }
    },
    [canPlan, executingId, projectId, refresh],
  );

  return {
    executingId,
    toast,
    selected,
    dryRun: (id: string) => runAction(id, 'dry'),
    confirm: (id: string) => runAction(id, 'confirm'),
    runLive: (id: string) => runAction(id, 'run'),
    selectTask: async (taskId: string | null) => {
      if (!taskId) {
        setSelected(null);
        return;
      }
      await loadDetail(projectId, taskId, setSelected);
    },
    clearToast: () => {
      setToast(null);
    },
  };
}

function usePollWhile(active: boolean, refresh: () => Promise<void>): void {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      clearInterval(t);
    };
  }, [active, refresh]);
}

async function loadDetail(
  projectId: string,
  taskId: string,
  setSelected: (d: TaskDetail | null) => void,
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}`);
  if (!res.ok) return;
  setSelected((await res.json()) as TaskDetail);
}
