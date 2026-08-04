import NextAuth from 'next-auth';

import { authConfig } from './config';

/**
 * The single `NextAuth()` call for the app. Split from `./config.ts` so that
 * `guards.ts` can import `auth` without pulling in the slice barrel, which
 * re-exports the guards themselves — that cycle is an error under
 * `import/no-cycle` (eslint.config.mjs).
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
