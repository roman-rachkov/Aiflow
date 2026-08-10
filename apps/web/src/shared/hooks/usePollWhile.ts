'use client';

import { useEffect } from 'react';

/**
 * Call `refresh` on an interval while `active` is true.
 * Used by tasks/deploy islands for in-flight work polling.
 */
export function usePollWhile(
  active: boolean,
  refresh: () => Promise<void>,
  intervalMs = 3000,
): void {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      clearInterval(t);
    };
  }, [active, refresh, intervalMs]);
}
