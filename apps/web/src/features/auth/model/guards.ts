import { redirect } from 'next/navigation';

import { getPublicClient } from '@aiflow/db';

// Imported from the sibling module, not from `../index`: the barrel re-exports
// these guards, so going through it would create a cycle that `import/no-cycle`
// rejects (eslint.config.mjs).
import type { SessionUser } from './config';
import { auth } from './nextauth';

/**
 * Server-side access checks for pages and route handlers.
 *
 * The two `require*` functions never return null — they redirect, which throws
 * a NEXT_REDIRECT control-flow error, so anything after the call is unreachable
 * for an unauthorised caller. `canAccessProject` deliberately returns a boolean
 * instead: the caller chooses between 404 and 403, and hiding a project's
 * existence is sometimes the right answer.
 */

/** The signed-in user, or a redirect to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user.id) redirect('/signin');

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? null,
    uiMode: session.user.uiMode,
  };
}

/**
 * A user in PRO mode, or a redirect home.
 *
 * Named for the mode, not for a role, because that is what it checks. The
 * earlier documents called PRO "Engineer" and docs/16-code-map.md forward-
 * declared this as `requireEngineer`, but `uiMode` is presentation — a switch
 * the user flips — and not a permission boundary (see the User model comment in
 * packages/db/prisma/schema.prisma). Anything that must not be reachable by a
 * determined BASIC user needs a real authorization check against `role`.
 */
export async function requireProMode(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.uiMode !== 'PRO') redirect('/');

  return user;
}

/**
 * Whether a user may reach a project.
 *
 * Ownership only. There is no collaborator or sharing model in the schema yet,
 * so "has access" and "owns" are currently the same question; when sharing
 * arrives this is the one place that has to learn the difference.
 */
export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const project = await getPublicClient().projectMeta.findUnique({
    // `deletedAt: null` excludes soft-deleted projects — they should behave as
    // if they do not exist. See the soft-delete convention on User in
    // packages/db/prisma/schema.prisma.
    where: { id: projectId, deletedAt: null },
    select: { ownerId: true, status: true },
  });

  if (!project) return false;

  return project.ownerId === userId;
}
