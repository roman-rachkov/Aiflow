'use client';

/**
 * Load audit events for a project / task via the Pro API.
 */

import { useCallback, useEffect, useState } from 'react';

import type { AuditEventView } from '../model/types';

export function useAuditEvents(projectId: string, taskId?: string) {
  const [items, setItems] = useState<AuditEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = taskId ? `?taskId=${encodeURIComponent(taskId)}` : '';
      const res = await fetch(`/api/projects/${projectId}/audit${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `HTTP ${String(res.status)}`);
      }
      const data = (await res.json()) as { events: AuditEventView[] };
      setItems(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
