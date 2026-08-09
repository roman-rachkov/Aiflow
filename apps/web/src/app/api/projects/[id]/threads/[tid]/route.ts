import { NextResponse } from 'next/server';

import { ensureThreadSchema } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import {
  deleteThread,
  getThread,
  listMessagesByThread,
  toAguiMessages,
  updateThread,
} from '@/features/chat';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Per-thread storage for the OpenUI `restStorage({ baseUrl })` client.
 *
 *   GET    /api/projects/{id}/threads/{tid}   → messages of the thread
 *   PATCH  /api/projects/{id}/threads/{tid}   → rename
 *   DELETE /api/projects/{id}/threads/{tid}   → soft-delete
 *
 * The GET path is what `restStorage.getMessages` hits on a thread switch. We
 * return AG-UI wire messages (id/role/content); the soft-delete invariant is
 * applied inside the service layer (`deletedAt: null` filters).
 *
 * `restStorage` names these `get/{tid}` / `update/{tid}` / `delete/{tid}`, but
 * Next.js dynamic segments map cleanly: we configure the client with a custom
 * path mapping (see the chat runtime), so these verbs match.
 */

/** Auth + project resolve + thread-schema backfill. Returns schemaName or a 404. */
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const { id, tid } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  const thread = await getThread(schemaName, tid);
  if (!thread) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
  }
  const messages = await listMessagesByThread(schemaName, tid);
  return NextResponse.json(toAguiMessages(messages));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const { id, tid } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === 'string' ? body.title : undefined;

  const thread = await updateThread(schemaName, tid, title !== undefined ? { title } : {});
  if (!thread) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tid: string }> },
) {
  const { id, tid } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  await deleteThread(schemaName, tid);
  return new NextResponse(null, { status: 204 });
}
