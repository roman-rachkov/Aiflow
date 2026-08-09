import { NextResponse } from 'next/server';

import type { ChatConfig, ChatMessage } from '@aiflow/ai-roles';
import { ensureThreadSchema } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import {
  listMessagesByThread,
  readSystemPrompt,
  saveMessage,
  withRagContext,
} from '@/features/chat';
import { retrieveContext } from '@/features/files/rag';
import { resolveAnalystProvider } from '@/features/model-config';
import type { ResolvedAnalystProvider } from '@/features/model-config';
import { resolveProjectSchema } from '@/features/projects';

/**
 * AG-UI streaming run for one thread.
 *
 * `POST /api/projects/{id}/threads/{tid}/run` is what our client-side `ChatLLM`
 * adapter calls. It receives the AG-UI `messages` for the thread (the latest
 * user turn is the last entry) and streams back AG-UI events that
 * `agUIAdapter.parse` consumes:
 *
 *   RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT* →
 *   TEXT_MESSAGE_END → RUN_FINISHED   (or RUN_ERROR on failure)
 *
 * Persistence mirrors the legacy `/chat` route: the USER row is saved before
 * the stream opens, the ASSISTANT row after the stream drains (with token
 * counts). RAG context + the Analyst system prompt are injected server-side.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

/** Encode one AG-UI event as an SSE `data:` frame. */
function encodeSse(payload: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/** Map persisted views onto the provider's ChatRole union for the LLM call. */
function toProviderMessages(
  views: ReadonlyArray<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>,
): ChatMessage[] {
  return views.map((m) => ({ role: m.role, content: m.content }));
}

interface RunInput {
  message: string;
  threadId: string;
}

/** Parse + validate the run body. Returns the text payload or a 400 response. */
function parseBody(body: unknown): RunInput | NextResponse {
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const obj = body as { messages?: unknown; threadId?: unknown };
  const msgs: readonly unknown[] = Array.isArray(obj.messages) ? obj.messages : [];
  // The latest user message drives this turn; AG-UI content can be a string.
  const last = msgs[msgs.length - 1];
  const content = extractContent(last);
  const text = content.trim();
  if (text.length === 0) {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }
  return { message: text, threadId: typeof obj.threadId === 'string' ? obj.threadId : '' };
}

/** Narrow a wire message to its string content, or '' when not present. */
function extractContent(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'content' in entry) {
    const c = (entry as { content?: unknown }).content;
    return typeof c === 'string' ? c : '';
  }
  return '';
}

interface RunContext {
  schemaName: string;
  threadId: string;
  history: ChatMessage[];
  config: ChatConfig;
  provider: ResolvedAnalystProvider['provider'];
  runId: string;
}

/** Stream tokens, returning the accumulated text + the usage promise. */
async function drainStream(
  ctx: RunContext,
  messageId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<{
  fullText: string;
  usage: Promise<{ tokensIn: number | null; tokensOut: number | null }>;
}> {
  const { stream, usage } = await ctx.provider.chatWithUsage(ctx.history, ctx.config);
  let fullText = '';
  for await (const chunk of stream) {
    fullText += chunk;
    controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: chunk }));
  }
  return { fullText, usage };
}

/** Stream the assistant reply as AG-UI events, persisting the ASSISTANT row at the end. */
function streamAssistantReply(ctx: RunContext): ReadableStream<Uint8Array> {
  const { threadId, runId } = ctx;
  const messageId = crypto.randomUUID();

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeSse({ type: 'RUN_STARTED', threadId, runId }));
      controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }));

      try {
        const { fullText, usage } = await drainStream(ctx, messageId, controller);
        controller.enqueue(encodeSse({ type: 'TEXT_MESSAGE_END', messageId }));
        const { tokensIn, tokensOut } = await usage;
        await saveMessage(ctx.schemaName, {
          role: 'ASSISTANT',
          content: fullText,
          threadId,
          tokensIn,
          tokensOut,
        });
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const { id, tid } = await params;
  const user = await requireUser();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }
  await ensureThreadSchema(schemaName);

  const parsed = parseBody(await request.json().catch(() => null));
  if (parsed instanceof NextResponse) return parsed;
  const { message } = parsed;

  // Persist the USER turn before the stream opens, tied to the thread.
  await saveMessage(schemaName, { role: 'USER', content: message, threadId: tid });

  let ragContext = '';
  try {
    ragContext = await retrieveContext(schemaName, message);
  } catch {
    ragContext = '';
  }

  const history = toProviderMessages(await listMessagesByThread(schemaName, tid));
  const systemPrompt = withRagContext(readSystemPrompt(), ragContext);
  const resolved = await resolveAnalystProvider(schemaName);
  const config: ChatConfig = {
    model: resolved.chatConfig.model,
    apiKey: resolved.chatConfig.apiKey,
    systemPrompt,
  };
  const runId = crypto.randomUUID();
  const body = streamAssistantReply({
    schemaName,
    threadId: tid,
    history,
    config,
    provider: resolved.provider,
    runId,
  });

  return new Response(body, { headers: SSE_HEADERS });
}
