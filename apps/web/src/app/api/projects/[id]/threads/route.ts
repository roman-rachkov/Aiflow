import { NextResponse } from 'next/server';

import { ensureThreadSchema } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import { createThread, listThreads, toAguiThread, aguiMessageText } from '@/features/chat';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Thread storage for the OpenUI `restStorage({ baseUrl })` client.
 *
 *   GET    /api/projects/{id}/threads?cursor=      → { threads, nextCursor }
 *   POST   /api/projects/{id}/threads              → create from first message
 *
 * `restStorage` calls these on ThreadList render and on "new chat". The wire
 * shape follows the OpenUI contract (AguiThread) — our `ChatThread` rows never
 * leak fields like `deletedAt`.
 *
 * `ensureThreadSchema` runs on every call: it is idempotent and backfills the
 * ChatThread shape + a "Главный" thread for project schemas created before
 * threads shipped, so any project opens onto a populated main thread.
 */

/** Auth + project resolve + thread-schema backfill. Returns schemaName or a 404 response. */
async function resolveThreadContext(
  projectId: string,
  userId: string,
): Promise<string | NextResponse> {
  const schemaName = await resolveProjectSchema(projectId, userId);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }
  await ensureThreadSchema(schemaName);
  return schemaName;
}

/** Pull the text of the first user message from a `restStorage` create payload, if any. */
function firstMessageText(body: { messages?: unknown }): string {
  const messages: readonly unknown[] = Array.isArray(body.messages) ? body.messages : [];
  const first: unknown = messages[0];
  if (first && typeof first === 'object' && 'content' in first) {
    return aguiMessageText(first);
  }
  return '';
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  const threads = await listThreads(schemaName);
  return NextResponse.json({
    threads: threads.map(toAguiThread),
    nextCursor: null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  const body = (await request.json().catch(() => ({}))) as {
    messages?: unknown;
    title?: unknown;
  };
  const text = firstMessageText(body);
  const title = typeof body.title === 'string' ? body.title.trim() : '';

  // The OpenUI client calls createThread(firstMessage) then llm.send separately.
  // Persisting the message here would duplicate the USER row that /run also
  // saves, so createThread only derives the title — the message is persisted by
  // the run endpoint when the assistant turn starts.
  const derivedTitle = text.length > 0 ? text : title;
  const thread = await createThread(schemaName, { title: derivedTitle || undefined });

  return NextResponse.json(toAguiThread(thread), { status: 201 });
}
