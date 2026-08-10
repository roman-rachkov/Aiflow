/**
 * AG-UI streaming for the tool-aware chat run (Stage E multi-turn).
 *
 * Drives `provider.chatWithTools` in a loop: after TOOL_CALL_RESULT, append
 * assistant + tool messages in-memory and re-call until the model replies with
 * text only or {@link MAX_TOOL_ITERS} is hit. Persists final assistant text only.
 */

import type { ChatConfig, ChatMessage, ChatResult } from '@aiflow/ai-roles';

import { saveMessage } from '@/features/chat';
import type { ResolvedAnalystProvider } from '@/features/model-config';

import { appendToolTurn, MAX_TOOL_ITERS, sumUsage, type CompletedToolTurn } from './run-loop';
import {
  accumulateToolCall,
  encodeSse,
  runPendingTools,
  type ToolCallAccum,
} from './run-tool-exec';
import type { ToolExecContext } from './run-tools';

export interface ToolAwareRunContext {
  schemaName: string;
  projectId: string;
  ownerId: string;
  uiMode: 'BASIC' | 'PRO';
  threadId: string;
  runId: string;
  history: ChatMessage[];
  config: ChatConfig;
  resolved: ResolvedAnalystProvider;
}

/** Bundle for one model-turn drain (keeps `drainModelTurn` under max-params). */
interface DrainArgs {
  ctx: ToolAwareRunContext;
  history: ChatMessage[];
  config: ChatConfig;
  controller: ReadableStreamDefaultController<Uint8Array>;
  messageId: string;
}

/** Stream the run: AG-UI events + multi-turn tools, persisting text at the end. */
export function streamToolAwareRun(ctx: ToolAwareRunContext): ReadableStream<Uint8Array> {
  const { threadId, runId, config } = ctx;
  const messageId = crypto.randomUUID();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeSse({ type: 'RUN_STARTED', threadId, runId }));
      controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }));

      let fullText = '';
      let usage: ChatResult = { tokensIn: null, tokensOut: null };
      const history = [...ctx.history];

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
          const turn = await drainModelTurn({ ctx, history, config, controller, messageId });
          fullText += turn.text;
          usage = sumUsage(usage, turn.usage);
          if (turn.completed.length === 0) break;
          appendToolTurn(history, turn.text, turn.completed);
        }
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

/** One chatWithTools drain: text deltas + optional tool executions. */
async function drainModelTurn(
  args: DrainArgs,
): Promise<{ text: string; usage: ChatResult; completed: CompletedToolTurn[] }> {
  const { ctx, history, config, controller, messageId } = args;
  const pending = new Map<number, ToolCallAccum>();
  let text = '';
  let completed: CompletedToolTurn[] = [];
  const execCtx: ToolExecContext = {
    schemaName: ctx.schemaName,
    projectId: ctx.projectId,
    ownerId: ctx.ownerId,
    uiMode: ctx.uiMode,
    resolved: ctx.resolved,
  };

  const { stream, usage: usageP } = await ctx.resolved.provider.chatWithTools(history, config);
  for await (const evt of stream) {
    if (evt.type === 'text') {
      text += evt.text;
      controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: evt.text }));
    } else if (evt.type === 'tool_call_delta') {
      accumulateToolCall(pending, evt, controller, messageId);
    } else {
      completed = await runPendingTools(pending, execCtx, controller);
    }
  }
  return { text, usage: await usageP, completed };
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
