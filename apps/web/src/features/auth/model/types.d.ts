import type { DefaultSession } from 'next-auth';

/**
 * Module augmentation for the claims this app adds to the default session and
 * JWT. Without it `token.uiMode` and `session.user.uiMode` do not typecheck —
 * `next-auth` ships deliberately minimal defaults and expects each app to
 * declare what it stores.
 *
 * `uiMode` is presentation, not authorization: see the User model comment in
 * packages/db/prisma/schema.prisma.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      uiMode: 'BASIC' | 'PRO';
    } & DefaultSession['user'];
  }

  interface User {
    // Optional, unlike on Session: `AdapterUser extends User`, and the Prisma
    // adapter builds its users from table columns without knowing about this
    // claim. Requiring it here would make every adapter return type invalid.
    uiMode?: 'BASIC' | 'PRO';
  }
}

// Augmented on `@auth/core/jwt`, not `next-auth/jwt`: the latter is a bare
// `export * from "@auth/core/jwt"`, and augmenting a re-export does not reach
// the interface it forwards.
declare module '@auth/core/jwt' {
  interface JWT {
    // Optional: the jwt() callback only sets it on initial sign-in (when the
    // `user` claim is present). A token minted through a path that skips that
    // branch carries no claim, and the session() callback defaults it to BASIC.
    uiMode?: 'BASIC' | 'PRO';
  }
}
