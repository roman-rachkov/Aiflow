import { NextResponse } from 'next/server';

/**
 * Liveness probe for Docker Compose healthchecks.
 * No auth, no DB — the container is up if Next can answer.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
