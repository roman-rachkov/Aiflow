import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { gateEditorRequest, listTree, mapEditorError } from '@/features/editor';

/**
 * GET /api/projects/[id]/editor/tree — file tree nodes for the editor.
 * Query: `ref` (default main via context), optional `path` subtree.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const ref = url.searchParams.get('ref') ?? undefined;
  const path = url.searchParams.get('path') ?? undefined;

  try {
    const nodes = await listTree(gate.ctx, { ref, path: path || undefined });
    return NextResponse.json(nodes);
  } catch (err) {
    return mapEditorError(err);
  }
}
