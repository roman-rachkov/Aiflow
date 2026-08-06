import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import { gateEditorRequest, listCommits, mapEditorError } from '@/features/editor';

/**
 * GET /api/projects/[id]/editor/commits — Git history for the panel.
 * Query: `ref`, `page`, `limit` (default 20, max 50 in the service).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const ref = url.searchParams.get('ref') ?? undefined;
  const page = parsePositiveInt(url.searchParams.get('page'));
  const limit = parsePositiveInt(url.searchParams.get('limit')) ?? 20;

  try {
    const commits = await listCommits(gate.ctx, { ref, page, limit });
    return NextResponse.json(commits);
  } catch (err) {
    return mapEditorError(err);
  }
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
