import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  assertProCode,
  CodeConflictError,
  CodeGiteaMissingError,
  CodeTaskNotFoundError,
  CodeWrongStatusError,
  enqueueConfirm,
  resolveCodeContext,
} from '@/features/tasks';

/**
 * POST — after dry-run, enqueue code:execute with dryRun:false. Pro + owner.
 */

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await ctx.params;
  const user = await requireUser();
  const forbidden = assertProCode(user);
  if (forbidden) return forbidden;

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
    const result = await enqueueConfirm(codeCtx, taskId);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return mapConfirmError(err);
  }
}

function mapConfirmError(err: unknown): NextResponse {
  if (err instanceof CodeTaskNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof CodeConflictError || err instanceof CodeWrongStatusError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof Error && /REDIS_URL|ECONNREFUSED|queue/i.test(err.message)) {
    return NextResponse.json({ error: 'Очередь временно недоступна' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Не удалось подтвердить задачу' }, { status: 500 });
}
