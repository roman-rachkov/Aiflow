import { NextResponse } from 'next/server';

import { requireUser } from '@/features/auth';
import {
  commitFiles,
  gateEditorRequest,
  gitAuthorFromSession,
  mapEditorError,
  publishSaved,
  type CommitFileInput,
} from '@/features/editor';

/**
 * POST /api/projects/[id]/editor/commit — save dirty files as one logical commit.
 * Body: `{ message?, branch?, files: [{ path, content, sha? }] }`. Empty files → 400.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const gate = await gateEditorRequest(id, user);
  if (!gate.ok) return gate.response;

  const body = (await request.json().catch(() => null)) as CommitBody | null;
  const files = parseCommitFiles(body?.files);
  if (!files) {
    return NextResponse.json({ error: 'Список files не должен быть пустым' }, { status: 400 });
  }

  try {
    const result = await commitFiles(gate.ctx, {
      message: typeof body?.message === 'string' ? body.message : undefined,
      branch: typeof body?.branch === 'string' ? body.branch : undefined,
      files,
      author: gitAuthorFromSession(user),
    });
    publishSaved(id, user.id, result.commitSha, result.files);
    return NextResponse.json(result);
  } catch (err) {
    return mapEditorError(err);
  }
}

type CommitBody = {
  message?: unknown;
  branch?: unknown;
  files?: unknown;
};

function parseCommitFiles(raw: unknown): CommitFileInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const files: CommitFileInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const row = item as Record<string, unknown>;
    if (typeof row.path !== 'string' || typeof row.content !== 'string') return null;
    const file: CommitFileInput = { path: row.path, content: row.content };
    if (typeof row.sha === 'string') file.sha = row.sha;
    files.push(file);
  }
  return files;
}
