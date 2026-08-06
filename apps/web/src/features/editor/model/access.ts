/**
 * Editor access gate: ownership + soft-delete, lazy Gitea provision, Pro API
 * check, and binary heuristic for 415 responses.
 *
 * Pro vs BASIC:
 * - **Pages** use `requireProMode` from `@/features/auth` (redirect to `/`).
 * - **API / WS** must NOT call `requireProMode`. After `requireUser()`, call
 *   `assertProApiUser` — non-null → return that 403 JSON as-is. WS closes with
 *   code **4403** when `uiMode !== 'PRO'` (same rule, different transport).
 */
import { getPublicClient } from '@aiflow/db';
import { NextResponse } from 'next/server';

import { ensureGiteaProvisioned } from './provision';
import type { EditorContext, ProApiUser } from './types';

const BINARY_SAMPLE = 8192;
const BINARY_CONTROL_RATIO = 0.3;

/**
 * Load an owned, non-deleted project and ensure Gitea identity exists.
 * Returns `null` for missing / soft-deleted / foreign — callers map to 404
 * (no existence leak). Lazy-provisions when giteaOwner/giteaRepo are null.
 */
export async function resolveEditorContext(
  projectId: string,
  userId: string,
): Promise<EditorContext | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      schemaName: true,
      ownerId: true,
      giteaOwner: true,
      giteaRepo: true,
      giteaDefaultBranch: true,
    },
  });
  if (!meta || meta.ownerId !== userId) return null;

  if (meta.giteaOwner && meta.giteaRepo) {
    return toContext(meta, meta.giteaOwner, meta.giteaRepo, meta.giteaDefaultBranch);
  }

  const gitea = await ensureGiteaProvisioned(meta.id, meta.name);
  return toContext(meta, gitea.owner, gitea.repo, gitea.defaultBranch);
}

/**
 * API Pro gate. Returns a 403 JSON response for BASIC users; `null` when PRO.
 * Do not use redirecting `requireProMode` in route handlers or WS handshake.
 */
export function assertProApiUser(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json({ error: 'Редактор доступен только в режиме Pro' }, { status: 403 });
}

/**
 * Heuristic for editor 415: NUL in the sample, or a high ratio of C0 controls
 * (excluding tab/LF/CR). Accepts decoded text or raw bytes.
 */
export function isBinaryContent(bytesOrText: string | Uint8Array): boolean {
  if (typeof bytesOrText === 'string') {
    return isBinaryString(bytesOrText);
  }
  return isBinaryBytes(bytesOrText);
}

function toContext(
  meta: { id: string; name: string; schemaName: string; ownerId: string },
  giteaOwner: string,
  giteaRepo: string,
  giteaDefaultBranch: string,
): EditorContext {
  return {
    id: meta.id,
    name: meta.name,
    schemaName: meta.schemaName,
    ownerId: meta.ownerId,
    giteaOwner,
    giteaRepo,
    giteaDefaultBranch,
  };
}

function isBinaryString(text: string): boolean {
  const sample = text.slice(0, BINARY_SAMPLE);
  if (sample.includes('\0')) return true;
  let controls = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (isSuspiciousControl(c)) controls++;
  }
  return sample.length > 0 && controls / sample.length > BINARY_CONTROL_RATIO;
}

function isBinaryBytes(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, BINARY_SAMPLE);
  let controls = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (isSuspiciousControl(b)) controls++;
  }
  return sample.length > 0 && controls / sample.length > BINARY_CONTROL_RATIO;
}

/** C0 controls except tab (9), LF (10), CR (13). */
function isSuspiciousControl(code: number): boolean {
  return code < 32 && code !== 9 && code !== 10 && code !== 13;
}
