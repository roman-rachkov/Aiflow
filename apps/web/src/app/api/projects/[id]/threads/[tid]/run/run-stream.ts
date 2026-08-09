/**
 * AG-UI streaming for the tool-aware chat run.
 *
 * Drives `provider.chatWithTools` and translates `LiveChatEvent`s into AG-UI
 * frames: text deltas → TEXT_MESSAGE_CONTENT; tool-call deltas →
 * TOOL_CALL_START/ARGS/END; on tool_calls_done the matching server-side
 * executor runs and its result is emitted as TOOL_CALL_RESULT. Assistant text
 * (if any) is persisted at the end. Kept separate from the route so the route
 * stays under the line cap.
 */

import type { ChatConfig, ChatMessage, ChatResult, LiveChatEvent } from '@aiflow/ai-roles';

import { saveMessage } from '@/features/chat';
import type { ResolvedAnalystProvider } from '@/features/model-config';

import { executeTool, type ToolResult } from './run-tools';

export interface ToolAwareRunContext {
  schemaName: string;
  threadId: string;
  runId: string;
  history: ChatMessage[];
  config: ChatConfig;
  resolved: ResolvedAnalystProvider;
}

/** Encode one AG-UI event as an SSE `data:` frame. */
function encodeSse(payload: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Accumulator for one in-flight tool call (id/name arrive first, args stream). */
interface ToolCallAccum {
  id: string;
  name: string;
  args: string;
}

/** Stream the run: AG-UI events + tool execution, persisting text at the end. */
export function streamToolAwareRun(ctx: ToolAwareRunContext): ReadableStream<Uint8Array> {
  const { threadId, runId, history, config } = ctx;
  const messageId = crypto.randomUUID();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeSse({ type: 'RUN_STARTED', threadId, runId }));
      controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }));

      let fullText = '';
      let usage: ChatResult = { tokensIn: null, tokensOut: null };
      const pendingTools = new Map<number, ToolCallAccum>();

      try {
        const { stream, usage: usageP } = await ctx.resolved.provider.chatWithTools(
          history,
          config,
        );
        for await (const evt of stream) {
          if (evt.type === 'text') {
            fullText += evt.text;
            controller.enqueue(
              encodeSse({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: evt.text }),
            );
          } else if (evt.type === 'tool_call_delta') {
            accumulateToolCall(pendingTools, evt, controller, messageId);
          } else {
            await runPendingTools(pendingTools, ctx, controller);
          }
        }
        usage = await usageP;
        controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_END', messageId }));
        await persistAssistant(ctx, fullText, usage);
        controller.enqueue(encodeSse({ type: 'RUN_FINISHED', threadId, runId }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка стриминга';
        controller.enqueue(encodeSse({ type: 'RUN_ERROR', message, threadId, runId }));
      } finally {
        controller.close();
      }
    },
  });
}

/** Fold one tool-call delta into the accumulator, emitting START/ARGS AG-UI frames. */
function accumulateToolCall(
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

/** After the model finishes tool calls, END each + execute + emit RESULT. */
async function runPendingTools(
  pending: Map<number, ToolCallAccum>,
  ctx: ToolAwareRunContext,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  for (const [, call] of pending) {
    controller.enqueue(encodeSse({ type: 'TOOL_CALL_END', toolCallId: call.id }));
    let result: ToolResult;
    try {
      result = await executeTool(call.name, safeParseArgs(call.args), {
        schemaName: ctx.schemaName,
        resolved: ctx.resolved,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка инструмента';
      result = { heading: call.name, content: { error: message }, error: true };
    }
    controller.enqueue(
      encodeSse({ type: 'TOOL_CALL_RESULT', toolCallId: call.id, content: result.content }),
    );
  }
  pending.clear();
}

/** Parse partial-JSON tool args defensively; never throw on malformed input. */
function safeParseArgs(raw: string): unknown {
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

/** Persist the assistant text turn (if any) after the run completes. */
async function persistAssistant(
  ctx: ToolAwareRunContext,
  text: string,
  usage: ChatResult,
): Promise<void> {
  if (text.trim().length === 0) return;
  await saveMessage(ctx.schemaName, {
    role: 'ASSISTANT',
    content: text,
    threadId: ctx.threadId,
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
  });
}
