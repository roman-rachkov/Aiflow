'use client';

/**
 * Client-side helper for forking a thread. The OpenUI headless
 * `ThreadListActions` has no fork primitive, so the custom sidebar item calls
 * this endpoint, then `selectThread(newId)` onto the freshly-created branch.
 * Returns the forked thread on success, or null on a network/HTTP failure.
 */

export interface ForkedThread {
  id: string;
  title: string;
  createdAt: string;
}

export async function forkThreadRest(
  projectId: string,
  threadId: string,
  title?: string,
): Promise<ForkedThread | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/threads/${threadId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(title ? { title } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as ForkedThread;
  } catch {
    return null;
  }
}
