import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  assertProDeploy,
  createDeployment,
  DeployConflictError,
  DeployGiteaMissingError,
  listDeployments,
  resolveDeployContext,
} from '@/features/deploy';
import { resolveProjectSchema } from '@/features/projects';
import { isGiteaUpstreamError } from '@/shared/gitea';

/**
 * GET — list deployments (owner BASIC+PRO).
 * POST — export templates, create Deployment/Meta, enqueue deploy:run (Pro).
 */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const schemaName = await resolveProjectSchema(id, user.id);
  if (!schemaName) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }
  const items = await listDeployments(schemaName, id);
  return NextResponse.json(items);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const forbidden = assertProDeploy(user);
  if (forbidden) return forbidden;

  let exportFirst = true;
  try {
    const body = (await request.json().catch(() => ({}))) as { exportFirst?: unknown };
    if (typeof body.exportFirst === 'boolean') exportFirst = body.exportFirst;
  } catch {
    /* defaults */
  }

  let ctx;
  try {
    ctx = await resolveDeployContext(id, user.id);
  } catch (err) {
    if (err instanceof DeployGiteaMissingError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
  if (!ctx) {
    return NextResponse.json({ error: 'Проект не найден' }, { status: 404 });
  }

  try {
    const result = await createDeployment(ctx, { exportFirst });
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    return mapCreateError(err);
  }
}

function mapCreateError(err: unknown): NextResponse {
  if (err instanceof DeployConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (isGiteaUpstreamError(err)) {
    return NextResponse.json({ error: 'Ошибка Gitea при экспорте шаблонов' }, { status: 502 });
  }
  if (err instanceof Error && /REDIS_URL|ECONNREFUSED|queue/i.test(err.message)) {
    return NextResponse.json({ error: 'Очередь временно недоступна' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Не удалось запустить сборку' }, { status: 500 });
}
