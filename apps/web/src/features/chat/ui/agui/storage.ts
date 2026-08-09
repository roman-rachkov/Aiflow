/**
 * Custom `ThreadStorage` for the OpenUI `ChatProvider`, wired to our REST
 * thread endpoints under `/api/projects/{id}/threads`.
 *
 * We do not use the library's `restStorage()` because it hard-codes
 * `/get`, `/create`, `/update/{id}`, `/delete/{id}` paths that don't match our
 * cleaner REST layout. This adapter speaks the same `ThreadStorage` contract
 * but to our routes. The wire format is AG-UI canonical messages
 * (`identityMessageFormat`): `{id, role, content}` — exactly what the backend
 * returns, so no conversion is needed.
 */

import type { Message, Thread, ThreadStorage, UserMessage } from '@openuidev/react-headless';

/** Build a ThreadStorage pointed at one project's thread REST surface. */
export function createThreadStorage(projectId: string): ThreadStorage {
  const base = `/api/projects/${projectId}/threads`;
  const json = async (res: Response): Promise<unknown> => {
    if (!res.ok) throw new Error(`threads: ${String(res.status)} ${res.statusText}`);
    return res.json();
  };

  return {
    async listThreads(): Promise<{ threads: Thread[]; nextCursor?: string }> {
      const data = (await json(await fetch(base))) as { threads: Thread[]; nextCursor?: string };
      return { threads: data.threads, nextCursor: data.nextCursor };
    },

    async createThread(firstMessage: UserMessage): Promise<Thread> {
      return (await json(
        await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [firstMessage] }),
        }),
      )) as Thread;
    },

    async getMessages(threadId: string): Promise<Message[]> {
      const data = await json(await fetch(`${base}/${threadId}`));
      return data as Message[];
    },

    async updateThread(thread: Thread): Promise<Thread> {
      return (await json(
        await fetch(`${base}/${thread.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: thread.title }),
        }),
      )) as Thread;
    },

    async deleteThread(id: string): Promise<void> {
      await fetch(`${base}/${id}`, { method: 'DELETE' });
    },
  };
}
