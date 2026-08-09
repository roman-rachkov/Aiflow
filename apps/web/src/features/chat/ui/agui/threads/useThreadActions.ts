'use client';

/**
 * Action handlers for one thread row: rename (save) and fork (create branch).
 *
 * Extracted from `ThreadRow` so that component stays under the 50-line function
 * cap. Rename calls the headless `updateThread` (PATCHes via our storage). Fork
 * calls the backend, then reloads the list (so the new branch appears) and
 * selects the branch.
 */

import { useCallback } from 'react';
import { useThreadList, type Thread } from '@openuidev/react-headless';

import { useProjectId } from '../messages/project-context';
import { forkThreadRest } from './api';

export function useThreadActions(thread: Thread, onSelect: (id: string) => void) {
  const updateThread = useThreadList((s) => s.updateThread);
  const loadThreads = useThreadList((s) => s.loadThreads);
  const projectId = useProjectId();

  const onRenameSave = useCallback(
    (title: string) => {
      updateThread({ ...thread, title });
    },
    [thread, updateThread],
  );

  const onFork = useCallback(async () => {
    const forked = await forkThreadRest(projectId, thread.id);
    if (forked) {
      loadThreads();
      onSelect(forked.id);
    }
  }, [projectId, thread.id, onSelect, loadThreads]);

  return { onRenameSave, onFork };
}
