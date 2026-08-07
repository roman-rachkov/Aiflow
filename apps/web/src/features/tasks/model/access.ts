/**
 * Pro gates for plan / code enqueue (mirrors deploy assertProDeploy).
 */

import { NextResponse } from 'next/server';

export type ProApiUser = { uiMode: 'BASIC' | 'PRO' };

/** 403 JSON when caller is not PRO (generate plan). */
export function assertProPlan(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json(
    { error: 'Генерация плана доступна только в режиме Pro' },
    { status: 403 },
  );
}

/** 403 JSON when caller is not PRO (execute / confirm coder). */
export function assertProCode(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json(
    { error: 'Запуск кодера доступен только в режиме Pro' },
    { status: 403 },
  );
}
