import { NextResponse } from 'next/server';

import { ensureThreadSchema } from '@aiflow/db';

import { requireUser } from '@/features/auth';
import { forkThread, toAguiThread } from '@/features/chat';
import { resolveProjectSchema } from '@/features/projects';

/**
 * Fork one thread into a new one that copies the source's messages.
 *
 *   POST /api/projects/{id}/threads/{tid}/fork   → { thread }
 *
 * `forkThread` creates a new `ChatThread` linked by `forkedFromId` and copies
 * the source's non-deleted messages into it (new ids, same order/content). The
 * client then `selectThread(newId)` to switch onto the branch, which diverges
 * as the user edits or continues from the copy.
 *
 * `ensureThreadSchema` runs once: idempotent backfill for schemas created
 * before threads shipped.
 */

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

  const body = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === 'string' ? body.title : undefined;

  const result = await forkThread(schemaName, tid, title);
  if (!result) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 });
  }
  return NextResponse.json(toAguiThread(result.thread), { status: 201 });
}
