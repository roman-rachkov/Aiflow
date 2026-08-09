/**
 * `ChatLLM` adapter bridging the OpenUI `ChatProvider` to our AG-UI streaming
 * run endpoint (`POST /api/projects/{id}/threads/{tid}/run`).
 *
 * `send()` POSTs the thread messages and returns the raw `Response`; the
 * `ChatProvider` runs it through `streamProtocol.parse()` (`agUIAdapter`), which
 * reads SSE `data:` frames and yields AG-UI events. Our backend emits exactly
 * those events (`RUN_STARTED`, `TEXT_MESSAGE_*`, `RUN_FINISHED/ERROR`), so the
 * bridge is a thin fetch — no client-side event shuffling.
 */

import { agUIAdapter, type ChatLLM } from '@openuidev/react-headless';

export function createProjectChatLLm(projectId: string): ChatLLM {
  return {
    streamProtocol: agUIAdapter(),
    async send({ threadId, messages, signal }): Promise<Response> {
      return fetch(`/api/projects/${projectId}/threads/${threadId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, messages }),
        signal,
      });
    },
  };
}
