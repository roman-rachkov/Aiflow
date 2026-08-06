import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  assertProDeploy,
  DeployGiteaMissingError,
  exportDeployTemplates,
  resolveDeployContext,
} from '@/features/deploy';
import { isGiteaUpstreamError } from '@/shared/gitea';

/**
 * POST — render Dockerfile + compose; optionally commit to Gitea.
 * Wiring only; logic in `features/deploy`. No dockerode.
 */

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const forbidden = assertProDeploy(user);
  if (forbidden) return forbidden;

  let commitToGitea = true;
  try {
    const body = (await request.json().catch(() => ({}))) as { commitToGitea?: unknown };
    if (typeof body.commitToGitea === 'boolean') commitToGitea = body.commitToGitea;
  } catch {
    /* empty body → defaults */
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
    const result = await exportDeployTemplates(ctx, { commitToGitea });
    return NextResponse.json({
      dockerfile: result.dockerfile,
      compose: result.compose,
      committed: result.committed,
      ...(result.commitSha ? { commitSha: result.commitSha } : {}),
    });
  } catch (err) {
    if (isGiteaUpstreamError(err)) {
      return NextResponse.json({ error: 'Ошибка Gitea при экспорте шаблонов' }, { status: 502 });
    }
    return NextResponse.json({ error: 'Не удалось экспортировать шаблоны' }, { status: 500 });
  }
}
