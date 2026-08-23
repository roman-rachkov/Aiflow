/**
 * Pro gate for the audit event feed API.
 */

import { NextResponse } from 'next/server';

export type ProApiUser = { uiMode: 'BASIC' | 'PRO' };

/** 403 JSON when caller is not PRO. */
export function assertProAudit(user: ProApiUser): NextResponse | null {
  if (user.uiMode === 'PRO') return null;
  return NextResponse.json(
    { error: 'Журнал аудита доступен только в режиме Pro' },
    { status: 403 },
  );
}
