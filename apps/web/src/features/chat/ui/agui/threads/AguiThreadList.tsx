'use client';

/**
 * Custom thread list for the OpenUI `AgentInterface` sidebar.
 *
 * Replaces the default `<AgentInterface.ThreadList/>` to add Rename and Fork on
 * top of the built-in Delete. The list reads `useThreadList`; each row renders
 * a title button (click → `selectThread`) and a `ThreadRowMenu` (ellipsis) with
 * the three actions. Visually mirrors the default `ThreadButton` classes.
 *
 * On mount it calls `loadThreads()` (the default ThreadList did this in its own
 * effect; the custom list must do the same or the sidebar stays empty).
 */

import { useEffect } from 'react';
import { useThreadList, type Thread } from '@openuidev/react-headless';

import { ThreadRow } from './ThreadRow';

export function AguiThreadList() {
  const threads = useThreadList((s) => s.threads);
  const isLoadingThreads = useThreadList((s) => s.isLoadingThreads);
  const selectThread = useThreadList((s) => s.selectThread);
  const loadThreads = useThreadList((s) => s.loadThreads);

  // The default ThreadList loads on mount; replicate so the sidebar populates.
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  if (isLoadingThreads && threads.length === 0) {
    return (
      <div className="openui-agent-sidebar-loading px-3 py-2 text-sm text-fg-muted">Загрузка…</div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="openui-agent-sidebar-empty px-3 py-2 text-sm text-fg-muted">
        Чатов пока нет
      </div>
    );
  }
  return (
    <nav className="openui-agent-thread-list flex flex-col gap-0.5" aria-label="Список чатов">
      {threads.map((t) => (
        <ThreadRow key={t.id} thread={t} onSelect={selectThread} />
      ))}
    </nav>
  );
}

export type ThreadRowProps = { thread: Thread; onSelect: (id: string) => void };
