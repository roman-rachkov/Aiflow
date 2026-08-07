import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  assertProCode,
  CodeConflictError,
  CodeGiteaMissingError,
  CodeTaskNotFoundError,
  CodeWrongStatusError,
  enqueueExecute,
  resolveCodeContext,
} from '@/features/tasks';

/**
 * POST — enqueue code:execute (`dryRun` default true). Pro + owner.
 */

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await ctx.params;
  const user = await requireUser();
  const forbidden = assertProCode(user);
  if (forbidden) return forbidden;

  let dryRun = true;
  try {
    const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };
    if (typeof body.dryRun === 'boolean') dryRun = body.dryRun;
  } catch {
    /* defaults */
  }

  let codeCtx;
  try {
    codeCtx = await resolveCodeContext(id, user.id);
  } catch (err) {
    if (err instanceof CodeGiteaMissingError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
  if (!codeCtx) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  try {
    const result = await enqueueExecute(codeCtx, taskId, dryRun);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return mapCodeError(err);
  }
}

function mapCodeError(err: unknown): NextResponse {
  if (err instanceof CodeTaskNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof CodeConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof CodeWrongStatusError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof Error && /REDIS_URL|ECONNREFUSED|queue/i.test(err.message)) {
    return NextResponse.json({ error: 'Очередь временно недоступна' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Не удалось запустить задачу' }, { status: 500 });
}
