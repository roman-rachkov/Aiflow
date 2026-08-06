import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { gateEditorRequest, getDiff, mapEditorError } from '@/features/editor';

/**
 * GET /api/projects/[id]/editor/diff — single-commit unified patches.
 * Query: required `sha`, optional `path` filter.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const sha = url.searchParams.get('sha');
  if (!sha?.trim()) {
    return NextResponse.json({ error: 'Параметр sha обязателен' }, { status: 400 });
  }
  const path = url.searchParams.get('path') ?? undefined;

  try {
    const diff = await getDiff(gate.ctx, { sha, path: path || undefined });
    return NextResponse.json(diff);
  } catch (err) {
    return mapEditorError(err);
  }
}
