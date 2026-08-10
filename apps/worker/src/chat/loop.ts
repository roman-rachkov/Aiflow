/**
 * Multi-turn tool-loop helpers for chat:run.
 */

import type { ChatMessage, ChatResult, ChatToolCall } from '@aiflow/ai-roles';

export const MAX_TOOL_ITERS = 5;

export interface CompletedToolTurn {
  id: string;
  name: string;
  args: string;
  resultContent: unknown;
}

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
