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
}

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
  return { message: text, threadId: typeof obj.threadId === 'string' ? obj.threadId : '' };
}

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

  await saveMessage(schemaName, { role: 'USER', content: message, threadId: tid });

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
