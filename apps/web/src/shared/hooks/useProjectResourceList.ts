'use client';

import { useCallback, useEffect, useState } from 'react';

export type ProjectResourceList<T> = {
  items: T[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export type UseProjectResourceListOptions = {
  /** Absolute or relative URL to fetch (GET → JSON array). */
  url: string;
  /** Fallback when the response has no `error` field. */
  loadErrorMessage: string;
  /** Fallback when the thrown value is not an Error. */
  fallbackErrorMessage?: string;
};

/**
 * Shared list island: fetch → items/loading/error + refresh on mount.
 * Feature hooks keep Russian error strings at the call site.
 */
export function useProjectResourceList<T>(
  options: UseProjectResourceListOptions,
): ProjectResourceList<T> {
  const { url, loadErrorMessage, fallbackErrorMessage = 'Ошибка загрузки' } = options;
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? loadErrorMessage);
      }
      setItems((await res.json()) as T[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackErrorMessage);
    } finally {
      setLoading(false);
    }
  }, [url, loadErrorMessage, fallbackErrorMessage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
