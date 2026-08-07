/**
 * Session lookup for task-log WS upgrades (same-origin Auth.js cookie).
 * Duplicates editor pattern to avoid feature→feature imports.
 */
import type { IncomingMessage } from 'node:http';

import { getToken } from 'next-auth/jwt';

import type { ProApiUser } from './access';

export type WsUser = ProApiUser & { id: string };

/** Decode JWT from upgrade cookies; null when unauthenticated. */
export async function sessionFromUpgrade(req: IncomingMessage): Promise<WsUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const cookie = req.headers.cookie ?? '';
  const token = await getToken({
    req: { headers: { cookie } },
    secret,
  });
  if (!token?.sub) return null;

  const uiMode = token.uiMode === 'PRO' ? 'PRO' : 'BASIC';
  return { id: token.sub, uiMode };
}
