import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  gateEditorRequest,
  gitAuthorFromSession,
  mapEditorError,
  renamePath,
} from '@/features/editor';

/**
 * POST /api/projects/[id]/editor/files/rename — rename via one logical commit.
 * Body: `{ fromPath, toPath, sha }`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => null)) as RenameBody | null;
  if (
    !body ||
    typeof body.fromPath !== 'string' ||
    typeof body.toPath !== 'string' ||
    typeof body.sha !== 'string' ||
    !body.fromPath.trim() ||
    !body.toPath.trim() ||
    !body.sha.trim()
  ) {
    return NextResponse.json(
      { error: 'Параметры fromPath, toPath и sha обязательны' },
      { status: 400 },
    );
  }

  try {
    const result = await renamePath(gate.ctx, {
      fromPath: body.fromPath,
      toPath: body.toPath,
      sha: body.sha,
      author: gitAuthorFromSession(user),
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapEditorError(err);
  }
}

type RenameBody = {
  fromPath?: unknown;
  toPath?: unknown;
  sha?: unknown;
};
