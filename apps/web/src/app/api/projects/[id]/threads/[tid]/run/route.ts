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
import { resolveProjectSchema } from '@/features/projects';

import { TOOL_DEFINITIONS } from './run-tools';
import { streamToolAwareRun } from './run-stream';

/**
 * AG-UI streaming run for one thread (tool-aware since Stage C).
 *
 * `POST /api/projects/{id}/threads/{tid}/run` is what our client-side `ChatLLM`
 * adapter calls. It receives the AG-UI `messages` for the thread and streams
 * back AG-UI events that `agUIAdapter.parse` consumes:
 *
 *   RUN_STARTED → TEXT_MESSAGE_START → (TEXT_MESSAGE_CONTENT* and/or
 *   TOOL_CALL_START → TOOL_CALL_ARGS* → TOOL_CALL_END → TOOL_CALL_RESULT)* →
 *   TEXT_MESSAGE_END → RUN_FINISHED   (or RUN_ERROR on failure)
 *
 * The model is offered server-side tools (`TOOL_DEFINITIONS`, currently
 * `spec:generate`). When the model emits a tool call, the route's
 * `run-stream.ts` runs the matching executor and emits the result. The
 * streaming + AG-UI translation lives in `run-stream.ts`; tool definitions +
 * executors in `run-tools.ts`. The USER row is saved before the stream opens;
 * the ASSISTANT text turn (if any) after it drains. RAG context + the Analyst
 * system prompt are injected server-side.
 */

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
} as const;

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
    // Advertise server-side tools so the Analyst can call them (e.g. spec:generate).
    tools: TOOL_DEFINITIONS,
  };
  const runId = crypto.randomUUID();
  const body = streamToolAwareRun({
    schemaName,
    projectId: id,
    ownerId: user.id,
    uiMode: user.uiMode,
    threadId: tid,
    history,
    config,
    resolved,
    runId,
  });

  return new Response(body, { headers: SSE_HEADERS });
}
