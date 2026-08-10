/**
 * AG-UI tool accumulation + execution for one model turn (Redis emit).
 */

import type { LiveChatEvent } from '@aiflow/ai-roles';

import type { CompletedToolTurn } from './loop';
import type { AguiEmitter } from './publish';
import { executeTool, type ToolExecContext, type ToolResult } from './tool-execute';

export interface ToolCallAccum {
  id: string;
  name: string;
  args: string;
}

export async function accumulateToolCall(
  pending: Map<number, ToolCallAccum>,
  evt: Extract<LiveChatEvent, { type: 'tool_call_delta' }>,
  emit: AguiEmitter['emit'],
  assistantMessageId: string,
): Promise<void> {
  const { index, id, name, arguments: argsChunk } = evt.delta;
  const existing = pending.get(index);
  const toolCallId = id ?? existing?.id ?? crypto.randomUUID();

  if (!existing) {
    pending.set(index, { id: toolCallId, name: name ?? '', args: argsChunk });
    await emit({
      type: 'TOOL_CALL_START',
      toolCallId,
      toolCallName: name ?? '',
      parentMessageId: assistantMessageId,
    });
  } else {
    existing.args += argsChunk;
    if (name) existing.name = name;
  }

  if (argsChunk.length > 0) {
    await emit({ type: 'TOOL_CALL_ARGS', toolCallId, delta: argsChunk });
  }
}

export async function runPendingTools(
  pending: Map<number, ToolCallAccum>,
  execCtx: ToolExecContext,
  emit: AguiEmitter['emit'],
): Promise<CompletedToolTurn[]> {
  const completed: CompletedToolTurn[] = [];
  for (const [, call] of pending) {
    await emit({ type: 'TOOL_CALL_END', toolCallId: call.id });
    const result = await safeExecute(call.name, call.args, execCtx);
    await emit({ type: 'TOOL_CALL_RESULT', toolCallId: call.id, content: result.content });
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
