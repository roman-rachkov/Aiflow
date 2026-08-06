/**
 * Session lookup for editor WS upgrades via same-origin Auth.js cookie.
 * Prefer cookie over ticket query (SPEC). Uses `getToken` from `next-auth/jwt`
 * because the upgrade runs outside App Router `auth()` request context.
 */
import type { IncomingMessage } from 'node:http';

import { getToken } from 'next-auth/jwt';

import type { EditorRouteUser } from './http';

/**
 * Decode the JWT session from the upgrade request cookies.
 * Returns null when unauthenticated (caller closes with 4403).
 */
export async function sessionFromUpgrade(req: IncomingMessage): Promise<EditorRouteUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const cookie = req.headers.cookie ?? '';
  const token = await getToken({
    req: { headers: { cookie } },
    secret,
  });
  if (!token?.sub) return null;

  const uiMode = token.uiMode === 'PRO' ? 'PRO' : 'BASIC';
  return {
    id: token.sub,
    email: typeof token.email === 'string' ? token.email : '',
    name: typeof token.name === 'string' ? token.name : null,
    uiMode,
  };
}
