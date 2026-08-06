'use client';

import { useCallback, useEffect, useState } from 'react';

import type { DeploymentDetail, DeploymentSummary } from '../model/types';

const POLL_MS = 4000;

export type UseDeploymentsResult = {
  items: DeploymentSummary[];
  loading: boolean;
  error: string | null;
  building: boolean;
  starting: boolean;
  expanded: DeploymentDetail | null;
  toast: string | null;
  highlightId: string | null;
  refresh: () => Promise<void>;
  startBuild: () => Promise<void>;
  openLog: (id: string) => Promise<void>;
  closeLog: () => void;
  clearToast: () => void;
};

/** List + poll while BUILDING + start build + expand log. */
export function useDeployments(
  projectId: string,
  initialHighlight: string | null,
  canBuild: boolean,
): UseDeploymentsResult {
  const list = useDeploymentList(projectId);
  const [starting, setStarting] = useState(false);
  const [expanded, setExpanded] = useState<DeploymentDetail | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState(initialHighlight);
  const building = list.items.some((i) => i.status === 'BUILDING');
  useBuildingPoll(building, list.refresh);

  const startBuild = useStartBuild({
    canBuild,
    starting,
    building,
    projectId,
    refresh: list.refresh,
    setStarting,
    setToast,
    setHighlightId,
  });

  const openLog = useOpenLog(projectId, setExpanded, setToast, setHighlightId);

  return {
    ...list,
    building,
    starting,
    expanded,
    toast,
    highlightId,
    startBuild,
    openLog,
    closeLog: () => {
      setExpanded(null);
    },
    clearToast: () => {
      setToast(null);
    },
  };
}

type StartArgs = {
  canBuild: boolean;
  starting: boolean;
  building: boolean;
  projectId: string;
  refresh: () => Promise<void>;
  setStarting: (v: boolean) => void;
  setToast: (v: string) => void;
  setHighlightId: (v: string) => void;
};

function useStartBuild(a: StartArgs) {
  return useCallback(async () => {
    if (!a.canBuild || a.starting || a.building) return;
    a.setStarting(true);
    try {
      const result = await postBuild(a.projectId);
      a.setToast(result.toast);
      if (result.deploymentId) a.setHighlightId(result.deploymentId);
      await a.refresh();
    } finally {
      a.setStarting(false);
    }
  }, [a]);
}

function useOpenLog(
  projectId: string,
  setExpanded: (d: DeploymentDetail | null) => void,
  setToast: (v: string) => void,
  setHighlightId: (v: string) => void,
) {
  return useCallback(
    async (id: string) => {
      const detail = await fetchDetail(projectId, id);
      if (!detail) {
        setToast('Не удалось загрузить лог');
        return;
      }
      setExpanded(detail);
      setHighlightId(id);
    },
    [projectId, setExpanded, setToast, setHighlightId],
  );
}

function useDeploymentList(projectId: string) {
  const [items, setItems] = useState<DeploymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/deployments`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Не удалось загрузить сборки');
      }
      setItems((await res.json()) as DeploymentSummary[]);
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

function useBuildingPoll(building: boolean, refresh: () => Promise<void>) {
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      clearInterval(t);
    };
  }, [building, refresh]);
}

async function postBuild(projectId: string): Promise<{ toast: string; deploymentId?: string }> {
  const res = await fetch(`/api/projects/${projectId}/deployments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    deploymentId?: string;
  };
  if (!res.ok) return { toast: body.error ?? 'Не удалось запустить сборку' };
  return { toast: 'Сборка поставлена в очередь', deploymentId: body.deploymentId };
}

async function fetchDetail(projectId: string, id: string): Promise<DeploymentDetail | null> {
  const res = await fetch(`/api/projects/${projectId}/deployments/${id}`);
  if (!res.ok) return null;
  return (await res.json()) as DeploymentDetail;
}
