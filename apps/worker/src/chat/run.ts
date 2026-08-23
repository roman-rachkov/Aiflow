/**
 * Multi-turn tool-aware chat run: publish AG-UI events to Redis.
 */

import type { ChatConfig, ChatMessage, ChatResult } from '@aiflow/ai-roles';
import type { ChatRunPayload } from '@aiflow/queue';

import { appendToolTurn, MAX_TOOL_ITERS, sumUsage, type CompletedToolTurn } from './loop';
import { listMessagesByThread, saveAssistantMessage } from './messages';
import { readSystemPrompt, withRagContext } from './prompt';
import { createAguiPublisher, type AguiEmitter } from './publish';
import { resolveAnalystProvider, type ResolvedAnalystProvider } from './resolve-provider';
import { retrieveContext } from './retrieve';
import { TOOL_DEFINITIONS } from './tool-defs';
import { accumulateToolCall, runPendingTools } from './tool-exec';
import type { ToolExecContext } from './tool-execute';

/** Run one chat:run job end-to-end. */
export async function runChatJob(payload: ChatRunPayload): Promise<void> {
  const publisher = createAguiPublisher(payload.runId);
  try {
    await runWithPublisher(payload, publisher);
  } finally {
    await publisher.close();
  }
}

async function runWithPublisher(payload: ChatRunPayload, publisher: AguiEmitter): Promise<void> {
  const { schemaName, threadId, runId, userMessage } = payload;
  const emit = publisher.emit;

  let ragContext = '';
  try {
    ragContext = await retrieveContext(schemaName, userMessage);
  } catch {
    ragContext = '';
  }

  const history = await listMessagesByThread(schemaName, threadId);
  const resolved = await resolveAnalystProvider(schemaName);
  const config: ChatConfig = {
    model: resolved.chatConfig.model,
    apiKey: resolved.chatConfig.apiKey,
    systemPrompt: withRagContext(readSystemPrompt(), ragContext),
    tools: TOOL_DEFINITIONS,
  };

  const messageId = crypto.randomUUID();
  await emit({ type: 'RUN_STARTED', threadId, runId });
  await emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });

  let fullText = '';
  let usage: ChatResult = { tokensIn: null, tokensOut: null };

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
      const turn = await drainModelTurn({
        payload,
        history,
        config,
        resolved,
        emit,
        messageId,
        ragContext,
      });
      fullText += turn.text;
      usage = sumUsage(usage, turn.usage);
      if (turn.completed.length === 0) break;
      appendToolTurn(history, turn.text, turn.completed);
    }
    await emit({ type: 'TEXT_MESSAGE_END', messageId });
    await saveAssistantMessage(schemaName, {
      content: fullText,
      threadId,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
    });
    await emit({ type: 'RUN_FINISHED', threadId, runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка стриминга';
    await emit({ type: 'RUN_ERROR', message, threadId, runId });
  }
}

interface DrainArgs {
  payload: ChatRunPayload;
  history: ChatMessage[];
  config: ChatConfig;
  resolved: ResolvedAnalystProvider;
  emit: AguiEmitter['emit'];
  messageId: string;
  ragContext: string;
}

async function drainModelTurn(
  args: DrainArgs,
): Promise<{ text: string; usage: ChatResult; completed: CompletedToolTurn[] }> {
  const { payload, history, config, resolved, emit, messageId, ragContext } = args;
  const pending = new Map<number, { id: string; name: string; args: string }>();
  let text = '';
  let completed: CompletedToolTurn[] = [];
  const execCtx: ToolExecContext = {
    schemaName: payload.schemaName,
    projectId: payload.projectId,
    ownerId: payload.ownerId,
    uiMode: payload.uiMode,
    resolved,
    userMessage: payload.userMessage,
    ragContext,
  };

  const { stream, usage: usageP } = await resolved.provider.chatWithTools(history, config);
  for await (const evt of stream) {
    if (evt.type === 'text') {
      text += evt.text;
      await emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: evt.text });
    } else if (evt.type === 'tool_call_delta') {
      await accumulateToolCall(pending, evt, emit, messageId);
    } else {
      completed = await runPendingTools(pending, execCtx, emit);
    }
  }
  return { text, usage: await usageP, completed };
}
