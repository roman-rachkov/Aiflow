/**
 * Multi-turn tool-loop helpers for the AG-UI `/run` stream.
 *
 * Keeps `run-stream.ts` under the file-size cap: history append, usage sum,
 * and the iteration guard live here.
 */

import type { ChatMessage, ChatResult, ChatToolCall } from '@aiflow/ai-roles';

/** Hard cap on chatWithTools rounds per user turn (infinite-loop / cost guard). */
export const MAX_TOOL_ITERS = 5;

/** One completed tool call + its executor result, ready for history append. */
export interface CompletedToolTurn {
  id: string;
  name: string;
  args: string;
  resultContent: unknown;
}

/** Sum nullable token counts across loop iterations. */
export function sumUsage(a: ChatResult, b: ChatResult): ChatResult {
  return {
    tokensIn: addNullable(a.tokensIn, b.tokensIn),
    tokensOut: addNullable(a.tokensOut, b.tokensOut),
  };
}

function addNullable(x: number | null, y: number | null): number | null {
  if (x == null && y == null) return null;
  return (x ?? 0) + (y ?? 0);
}

/**
 * Append the assistant tool-call turn and each TOOL result to the in-memory
 * history so the next `chatWithTools` call can continue the loop. Not persisted.
 */
export function appendToolTurn(
  history: ChatMessage[],
  assistantText: string,
  completed: CompletedToolTurn[],
): void {
  const toolCalls: ChatToolCall[] = completed.map((c) => ({
    id: c.id,
    name: c.name,
    arguments: c.args,
  }));
  history.push({ role: 'ASSISTANT', content: assistantText, toolCalls });
  for (const c of completed) {
    history.push({
      role: 'TOOL',
      content: JSON.stringify(c.resultContent),
      toolCallId: c.id,
    });
  }
}
