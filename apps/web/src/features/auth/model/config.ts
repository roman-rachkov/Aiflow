import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getPublicClient } from '@aiflow/db';

/**
 * NextAuth configuration, kept separate from the `NextAuth()` call in
 * `./nextauth.ts` so the route handler and the server-side guards can both
 * reach it without an import cycle.
 *
 * Only the Credentials provider ships in MVP. The roadmap (docs/04-roadmap.md,
 * task 1.2) specifies an Email magic link and GitHub OAuth; both need external
 * credentials that make local development impossible without a mail trap or an
 * OAuth app registration. The `providers` array is the only thing that has to
 * change to add them — see docs/14-decisions-needed.md for the deviation.
 */

/** Session shape after the callbacks below have run. */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  uiMode: 'BASIC' | 'PRO';
}

export const authConfig = {
  adapter: PrismaAdapter(getPublicClient()),

  // JWT rather than database sessions: Credentials cannot use the database
  // strategy — the adapter never creates a Session row for it.
  session: { strategy: 'jwt' },

  pages: { signIn: '/signin' },

  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      /**
       * Returns null for every failure — unknown address, no password set, or
       * a wrong password are indistinguishable to the caller. Telling them
       * apart would let anyone enumerate registered email addresses.
       */
      async authorize(credentials) {
        const email = credentials.email;
        const password = credentials.password;
        if (typeof email !== 'string' || typeof password !== 'string') return null;

        const user = await getPublicClient().user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        // passwordHash is deliberately not spread in: it must never reach the
        // JWT, and returning the whole row is how it would get there.
        return { id: user.id, email: user.email, name: user.name, uiMode: user.uiMode };
      },
    }),
  ],

  callbacks: {
    // `user` is only present on initial sign-in; on later token refreshes the
    // claim is already there and re-reading the database on every request would
    // defeat the point of a JWT session. NextAuth types `user` as always
    // present, which is why the check is on the claim rather than on `user` —
    // `no-unnecessary-condition` rejects the latter as statically truthy.
    //
    // The BASIC fallback matters: `uiMode` is optional on `User` (see
    // types.d.ts), so a sign-in through a future OAuth provider would leave it
    // unset. Defaulting to the less-privileged view is the safe direction.
    jwt({ token, user }) {
      const claim = user as { uiMode?: 'BASIC' | 'PRO' } | undefined;
      if (claim) {
        token.uiMode = claim.uiMode ?? 'BASIC';
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.uiMode = token.uiMode;
      return session;
    },
  },
} satisfies NextAuthConfig;
