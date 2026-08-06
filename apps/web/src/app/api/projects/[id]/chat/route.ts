import { NextResponse } from 'next/server';

import type { ChatConfig, ChatMessage } from '@aiflow/ai-roles';

import { requireUser } from '@/features/auth';
import { retrieveContext } from '@/features/files/rag';
import { listMessages, saveMessage } from '@/features/chat/model/service';
import { readSystemPrompt, withRagContext } from '@/features/chat/model/schema';
import { resolveAnalystProvider } from '@/features/model-config';
import type { ResolvedAnalystProvider } from '@/features/model-config';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Streaming chat turn against the Analyst agent.
 *
 * Auth and validation run before the response body is committed: a missing or
 * foreign project answers 404 (no existence leak). ModelConfig is resolved via
 * `resolveAnalystProvider` (project key → OpenAI-compatible; else env).
 * Embeddings/RAG stay on env inside `retrieveContext`.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/** Encode one SSE frame as bytes. `event` is omitted for default data frames. */
function encodeSse(payload: unknown, event?: string): Uint8Array {
  const encoder = new TextEncoder();
  const body =
    event === undefined
      ? `data: ${JSON.stringify(payload)}\n\n`
      : `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  return encoder.encode(body);
}

/** Map the persisted view's role union onto the provider's ChatRole. */
function toProviderMessages(
  views: ReadonlyArray<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>,
): ChatMessage[] {
  return views.map((m) => ({ role: m.role, content: m.content }));
}

/** Run the provider stream, emitting SSE frames and persisting the assistant row. */
function streamAssistantReply(
  schemaName: string,
  history: ChatMessage[],
  config: ChatConfig,
  resolved: ResolvedAnalystProvider,
): ReadableStream<Uint8Array> {
  const { provider } = resolved;

  return new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        const { stream, usage } = await provider.chatWithUsage(history, config);
        for await (const chunk of stream) {
          fullText += chunk;
          controller.enqueue(encodeSse({ content: chunk }));
        }
        const { tokensIn, tokensOut } = await usage;
        await saveMessage(schemaName, {
          role: 'ASSISTANT',
          content: fullText,
          tokensIn,
          tokensOut,
        });
        controller.enqueue(encodeSse('[DONE]'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ошибка стриминга';
        controller.enqueue(encodeSse({ message }, 'error'));
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  let message: string;
  try {
    const body = (await request.json()) as { message?: unknown };
    message = typeof body.message === 'string' ? body.message.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }
  if (message.length === 0) {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }

  await saveMessage(schemaName, { role: 'USER', content: message });

  let ragContext = '';
  try {
    ragContext = await retrieveContext(schemaName, message);
  } catch {
    ragContext = '';
  }

  const history = toProviderMessages(await listMessages(schemaName));
  const systemPrompt = withRagContext(readSystemPrompt(), ragContext);
  const resolved = await resolveAnalystProvider(schemaName);
  const config: ChatConfig = {
    model: resolved.chatConfig.model,
    apiKey: resolved.chatConfig.apiKey,
    systemPrompt,
  };
  const body = streamAssistantReply(schemaName, history, config, resolved);

  return new Response(body, { headers: SSE_HEADERS });
}
