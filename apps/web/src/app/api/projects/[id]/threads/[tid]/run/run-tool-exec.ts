/**
 * AG-UI tool-call accumulation + server-side execution for one model turn.
 */

import type { LiveChatEvent } from '@aiflow/ai-roles';

import { type CompletedToolTurn } from './run-loop';
import { executeTool, type ToolExecContext, type ToolResult } from './run-tools';

/** Accumulator for one in-flight tool call (id/name arrive first, args stream). */
export interface ToolCallAccum {
  id: string;
  name: string;
  args: string;
}

/** Encode one AG-UI event as an SSE `data:` frame. */
export function encodeSse(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Fold one tool-call delta into the accumulator, emitting START/ARGS frames. */
export function accumulateToolCall(
  pending: Map<number, ToolCallAccum>,
  evt: Extract<LiveChatEvent, { type: 'tool_call_delta' }>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  assistantMessageId: string,
): void {
  const { index, id, name, arguments: argsChunk } = evt.delta;
  const existing = pending.get(index);
  const toolCallId = id ?? existing?.id ?? crypto.randomUUID();

  if (!existing) {
    pending.set(index, { id: toolCallId, name: name ?? '', args: argsChunk });
    controller.enqueue(
      encodeSse({
        type: 'TOOL_CALL_START',
        toolCallId,
        toolCallName: name ?? '',
        parentMessageId: assistantMessageId,
      }),
    );
  } else {
    existing.args += argsChunk;
    if (name) existing.name = name;
  }

  if (argsChunk.length > 0) {
    controller.enqueue(encodeSse({ type: 'TOOL_CALL_ARGS', toolCallId, delta: argsChunk }));
  }
}

/** END each pending call, execute, emit RESULT; return completed turns. */
export async function runPendingTools(
  pending: Map<number, ToolCallAccum>,
  execCtx: ToolExecContext,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<CompletedToolTurn[]> {
  const completed: CompletedToolTurn[] = [];
  for (const [, call] of pending) {
    controller.enqueue(encodeSse({ type: 'TOOL_CALL_END', toolCallId: call.id }));
    const result = await safeExecute(call.name, call.args, execCtx);
    controller.enqueue(
      encodeSse({ type: 'TOOL_CALL_RESULT', toolCallId: call.id, content: result.content }),
    );
    completed.push({
      id: call.id,
      name: call.name,
      args: call.args,
      resultContent: result.content,
    });
  }
  pending.clear();
  return completed;
}

async function safeExecute(
  name: string,
  rawArgs: string,
  execCtx: ToolExecContext,
): Promise<ToolResult> {
  try {
    return await executeTool(name, safeParseArgs(rawArgs), execCtx);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка инструмента';
    return { heading: name, content: { error: message }, error: true };
  }
}

function safeParseArgs(raw: string): unknown {
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}
