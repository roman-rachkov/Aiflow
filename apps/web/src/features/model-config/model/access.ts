/**
 * API Pro gate for ModelConfig routes.
 * Pages use redirecting `requireProMode`; handlers use this JSON 403.
 * Avoids importing `@/features/auth` (FSD forbids feature→feature).
 */

import { NextResponse } from 'next/server';

/** Minimal session shape for the API Pro gate. */
export type ProApiUser = {
  uiMode: 'BASIC' | 'PRO';
};

/** 403 JSON when the caller is not in PRO mode; null when allowed. */
export function assertProModelConfig(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json(
    { error: 'Настройки модели доступны только в режиме Pro' },
    { status: 403 },
  );
}

/** True when the error is a missing/invalid ENCRYPTION_KEY. */
export function isEncryptionKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /ENCRYPTION_KEY/.test(error.message);
}
