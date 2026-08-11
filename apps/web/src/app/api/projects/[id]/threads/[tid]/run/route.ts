import { NextResponse } from 'next/server';

import { ensureThreadSchema } from '@aiflow/db';
import { getChatRunQueue } from '@aiflow/queue';

import { requireUser } from '@/features/auth';
import { saveMessage } from '@/features/chat';
import { resolveProjectSchema } from '@/features/projects';

import { openChatRunBridge } from './run-bridge';

/**
 * AG-UI streaming run for one thread.
 *
 * Auth + USER persist happen here; the multi-turn tool-aware LLM loop runs on
 * the `chat:run` worker. This route subscribes to Redis `chat:run:{runId}` and
 * bridges AG-UI events as SSE so the OpenUI client contract stays unchanged.
 *
 * Limitation: aborting the client unsubscribes the bridge; an in-flight worker
 * turn may still finish and persist the assistant message.
 */

interface RunInput {
  message: string;
  threadId: string;
  /** AG-UI optimistic USER id — reused as the ChatMessage PK when valid. */
  clientMessageId?: string;
}

/** RFC 4122 UUID (any version) — AG-UI uses crypto.randomUUID(). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parse + validate the run body. Returns the text payload or a 400 response. */
function parseBody(body: unknown): RunInput | NextResponse {
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 });
  }
  const obj = body as { messages?: unknown; threadId?: unknown };
  const msgs: readonly unknown[] = Array.isArray(obj.messages) ? obj.messages : [];
  const last = msgs[msgs.length - 1];
  const content = extractContent(last);
  const text = content.trim();
  if (text.length === 0) {
    return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 });
  }
  const clientMessageId = extractClientId(last);
  return {
    message: text,
    threadId: typeof obj.threadId === 'string' ? obj.threadId : '',
    ...(clientMessageId ? { clientMessageId } : {}),
  };
}

function extractContent(entry: unknown): string {
  if (entry && typeof entry === 'object' && 'content' in entry) {
    const c = (entry as { content?: unknown }).content;
    return typeof c === 'string' ? c : '';
  }
  return '';
}

function extractClientId(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object' || !('id' in entry)) return undefined;
  const id = (entry as { id?: unknown }).id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) return undefined;
  return id;
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
  const { message, clientMessageId } = parsed;

  await saveMessage(schemaName, {
    role: 'USER',
    content: message,
    threadId: tid,
    ...(clientMessageId ? { id: clientMessageId } : {}),
  });

  const runId = crypto.randomUUID();
  const response = await openChatRunBridge(runId, request.signal);

  await getChatRunQueue().add(
    'chat-run',
    {
      projectId: id,
      schemaName,
      threadId: tid,
      runId,
      ownerId: user.id,
      uiMode: user.uiMode,
      userMessage: message,
    },
    { jobId: runId },
  );

  return response;
}
