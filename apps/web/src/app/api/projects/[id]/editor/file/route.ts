import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { gateEditorRequest, getFileContent, mapEditorError } from '@/features/editor';

/**
 * GET /api/projects/[id]/editor/file — utf-8 file content for Monaco.
 * Query: required `path`, optional `ref`. Binary → 415; missing → 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path?.trim()) {
    return NextResponse.json({ error: 'Параметр path обязателен' }, { status: 400 });
  }
  const ref = url.searchParams.get('ref') ?? undefined;

  try {
    const file = await getFileContent(gate.ctx, path, ref);
    return NextResponse.json(file);
  } catch (err) {
    return mapEditorError(err);
  }
}
