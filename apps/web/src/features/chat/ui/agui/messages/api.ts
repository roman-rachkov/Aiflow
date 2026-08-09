'use client';

/**
 * Client-side persistence helpers for per-message mutations.
 *
 * The OpenUI headless `updateMessage` / `deleteMessage` change only the
 * in-memory store (the `ThreadStorage` contract has no message-mutation
 * methods). These helpers call our REST endpoints so an edit or delete survives
 * a thread reload. Each returns `true` on success, `false` on a network/HTTP
 * failure — the caller has already updated the in-memory store optimistically.
 */

async function safe(method: string, url: string, body?: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function editMessage(
  projectId: string,
  threadId: string,
  messageId: string,
  content: string,
) {
  return safe('PATCH', `/api/projects/${projectId}/threads/${threadId}/messages/${messageId}`, {
    content,
  });
}

export function removeMessage(projectId: string, threadId: string, messageId: string) {
  return safe('DELETE', `/api/projects/${projectId}/threads/${threadId}/messages/${messageId}`);
}
