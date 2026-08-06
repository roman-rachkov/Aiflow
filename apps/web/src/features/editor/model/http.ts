/**
 * Thin helpers for editor App Router handlers: Pro/owner gate, session author,
 * and domain/upstream error → HTTP status with Russian messages at the boundary.
 */
import { NextResponse } from 'next/server';

import { isGiteaUpstreamError } from '@/shared/gitea';

import { assertProApiUser, resolveEditorContext } from './access';
import { isBinaryFileError, isConflictError, isNotFoundError } from './errors';
import type { EditorContext, EditorGitAuthor, ProApiUser } from './types';

/** Session fields routes pass after `requireUser()` (no auth-feature import). */
export type EditorRouteUser = ProApiUser & {
  id: string;
  email: string;
  name: string | null;
};

export type EditorGateOk = { ok: true; ctx: EditorContext };
export type EditorGateErr = { ok: false; response: NextResponse };
export type EditorGateResult = EditorGateOk | EditorGateErr;

/**
 * Pro check + ownership/soft-delete resolve (lazy Gitea provision inside).
 * BASIC → 403; missing/foreign/deleted → 404.
 */
export async function gateEditorRequest(
  projectId: string,
  user: EditorRouteUser,
): Promise<EditorGateResult> {
  const forbidden = assertProApiUser(user);
  if (forbidden) return { ok: false, response: forbidden };

  const ctx = await resolveEditorContext(projectId, user.id);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Проект не найден' }, { status: 404 }),
    };
  }
  return { ok: true, ctx };
}

/** Commit author/committer from session — never Gitea admin identity. */
export function gitAuthorFromSession(user: EditorRouteUser): EditorGitAuthor {
  const email = user.email.trim();
  const local = email.includes('@') ? email.slice(0, email.indexOf('@')) : email;
  const name = user.name?.trim() || local || email;
  return { name, email };
}

/** Map typed editor / Gitea errors to JSON responses; rethrow unknowns. */
export function mapEditorError(err: unknown): NextResponse {
  if (isBinaryFileError(err)) {
    return NextResponse.json(
      { error: 'Бинарный файл нельзя открыть в редакторе' },
      { status: 415 },
    );
  }
  if (isNotFoundError(err)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
  }
  if (isConflictError(err)) {
    return NextResponse.json({ error: 'Конфликт версий файла' }, { status: 409 });
  }
  if (isGiteaUpstreamError(err)) {
    return NextResponse.json({ error: 'Сервис Git недоступен' }, { status: 502 });
  }
  throw err;
}
