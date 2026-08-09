import { NextResponse } from 'next/server';

import { ensureThreadSchema } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import { deleteMessage, updateMessageContent } from '@/features/chat';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Per-message mutations for the grown-up chat.
 *
 *   PATCH   /api/projects/{id}/threads/{tid}/messages/{mid}   → edit content
 *   DELETE  /api/projects/{id}/threads/{tid}/messages/{mid}   → soft-delete
 *
 * The OpenUI headless `updateMessage` / `deleteMessage` change only the in-memory
 * store; these routes persist the same edit/delete to the project schema so the
 * change survives a thread reload. The `tid` path segment is carried for route
 * consistency (messages belong to a thread) but the row is addressed by id.
 *
 * `ensureThreadSchema` runs once: idempotent backfill for schemas created before
 * threads shipped (see packages/db ensureThreadSchema).
 */

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; tid: string; mid: string }> },
) {
  const { id, tid, mid } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  const body = (await request.json().catch(() => ({}))) as { content?: unknown };
  if (typeof body.content !== 'string' || body.content.trim().length === 0) {
    return NextResponse.json({ error: 'Введите текст сообщения' }, { status: 400 });
  }

  const updated = await updateMessageContent(schemaName, mid, body.content);
  if (!updated) {
    return NextResponse.json({ error: 'Сообщение не найдено' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, threadId: tid });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tid: string; mid: string }> },
) {
  const { id, mid } = await params;
  const user = await requireUser();
  const schemaName = await resolveThreadContext(id, user.id);
  if (schemaName instanceof NextResponse) return schemaName;

  await deleteMessage(schemaName, mid);
  return new NextResponse(null, { status: 204 });
}
