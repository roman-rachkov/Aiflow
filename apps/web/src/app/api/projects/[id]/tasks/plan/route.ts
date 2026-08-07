import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { resolveProjectSchema } from '@/features/projects';
import { assertProPlan, enqueuePlan, PlanSpecRequiredError } from '@/features/tasks';

/**
 * POST — enqueue plan:generate for an approved Specification (Pro+owner).
 * Body: `{ version?: number }` — default latest approved.
 */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const forbidden = assertProPlan(user);
  if (forbidden) return forbidden;

  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  let version: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { version?: unknown };
    if (typeof body.version === 'number' && Number.isFinite(body.version)) {
      version = body.version;
    }
  } catch {
    /* defaults */
  }

  try {
    const result = await enqueuePlan(id, schemaName, { version });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return mapEnqueueError(err);
  }
}

function mapEnqueueError(err: unknown): NextResponse {
  if (err instanceof PlanSpecRequiredError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof Error && /REDIS_URL|ECONNREFUSED|queue/i.test(err.message)) {
    return NextResponse.json({ error: 'Очередь временно недоступна' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Не удалось запустить планирование' }, { status: 500 });
}
