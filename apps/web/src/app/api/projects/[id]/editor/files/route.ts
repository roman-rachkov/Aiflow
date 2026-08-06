import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  createPath,
  deletePath,
  gateEditorRequest,
  gitAuthorFromSession,
  mapEditorError,
} from '@/features/editor';

/**
 * POST /api/projects/[id]/editor/files — create file or directory (`.gitkeep`).
 * DELETE — remove file by `path` + `sha` (JSON body or query).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body || typeof body.path !== 'string' || !body.path.trim()) {
    return NextResponse.json({ error: 'Параметр path обязателен' }, { status: 400 });
  }

  try {
    const result = await createPath(gate.ctx, {
      path: body.path,
      content: typeof body.content === 'string' ? body.content : undefined,
      isDir: body.isDir === true,
      author: gitAuthorFromSession(user),
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapEditorError(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const { path, sha } = await readDeleteArgs(request);
  if (!path || !sha) {
    return NextResponse.json({ error: 'Параметры path и sha обязательны' }, { status: 400 });
  }

  try {
    const result = await deletePath(gate.ctx, {
      path,
      sha,
      author: gitAuthorFromSession(user),
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapEditorError(err);
  }
}

type CreateBody = {
  path?: unknown;
  content?: unknown;
  isDir?: unknown;
};

async function readDeleteArgs(request: Request): Promise<{ path?: string; sha?: string }> {
  const url = new URL(request.url);
  const fromQuery = {
    path: url.searchParams.get('path') ?? undefined,
    sha: url.searchParams.get('sha') ?? undefined,
  };
  if (fromQuery.path && fromQuery.sha) return fromQuery;

  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    sha?: unknown;
  } | null;
  return {
    path: typeof body?.path === 'string' ? body.path : fromQuery.path,
    sha: typeof body?.sha === 'string' ? body.sha : fromQuery.sha,
  };
}
