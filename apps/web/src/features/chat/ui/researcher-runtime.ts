/**
 * assistant-ui ChatModelAdapter for the Analyst chat turn.
 *
 * Bridges assistant-ui's runtime to the project chat route
 * (POST /api/projects/{id}/chat). The route streams SSE deltas; assistant-ui
 * REPLACES the assistant message content on each yield rather than appending,
 * so this adapter accumulates `fullText` and yields the cumulative state each
 * time a delta arrives. A wrong convention here (yielding deltas) renders only
 * the last token — the bug this split exists to make impossible.
 *
 * The SSE framing lives in ./parse-sse-response so this file stays under the
 * `max-lines-per-function` ceiling; the adapter's `run` is linear glue around
 * it.
 */
import type { ChatModelAdapter } from '@assistant-ui/react';

import { parseSseResponse } from './parse-sse-response';

/**
 * Build an adapter bound to `projectId`. The id is fixed for the life of a
 * ChatPanel mount, so the factory returns a stable object rather than closing
 * over a changing prop — useLocalRuntime keys identity off the adapter.
 */
export function createResearcherAdapter(projectId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const userText = extractLastUserText(messages);
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
        signal: abortSignal,
      });
      if (!res.ok || !res.body) {
        throw new Error(await describeHttpError(res));
      }

      let fullText = '';
      for await (const delta of parseSseResponse(res.body)) {
        fullText += delta;
        // assistant-ui replaces content on yield, so emit the full text.
        yield { content: [{ type: 'text', text: fullText }] };
      }
      // A final yield guarantees a terminal message even if the route sent no
      // deltas (an empty-but-successful turn). The generator returns void per
      // the ChatModelAdapter contract — the last yield carries the final state.
      if (fullText.length === 0) {
        yield { content: [{ type: 'text', text: '' }] };
      }
    },
  };
}

/** Pull the concatenated text of the most recent user message from history. */
function extractLastUserText(
  messages: ReadonlyArray<{
    role: 'user' | 'assistant' | 'system';
    content: ReadonlyArray<{ type: string; text?: string }>;
  }>,
): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return '';
  return lastUser.content
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

/** Render a non-2xx response as a throwable message, preferring the JSON body. */
async function describeHttpError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* not JSON — fall through to status text */
  }
  return `Ошибка запроса (${String(res.status)})`;
}
