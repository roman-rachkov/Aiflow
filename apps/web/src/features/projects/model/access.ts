/**
 * Per-project access helpers shared across API routes.
 *
 * Extracted from `app/api/projects/[id]/chat/route.ts` so the Task 2.1 routes
 * (research, sources, …) reuse one implementation instead of copy-pasting the
 * same gate. Kept in the projects slice — not `app/` — because the helper is
 * project-shaped (it reads `projectMeta`) and the slice is its natural home.
 *
 * This slice stays self-contained: it imports only `@aiflow/db`. The original
 * chat-route helper also called `canAccessProject` from `@/features/auth` as a
 * pre-gate, but the FSD boundary policy (eslint.config.mjs, `boundaries/
 * dependencies`) forbids feature→feature imports, and the `projectMeta` read
 * below already enforces both `deletedAt: null` and ownership on its own — the
 * `canAccessProject` call was redundant defense in depth. Dropping it preserves
 * the security posture (a missing, deleted, or foreign project all yield
 * `null`, which callers map to a 404 with no existence leak) without crossing
 * slice boundaries.
 */
import { getPublicClient } from '@aiflow/db';

/**
 * Resolve the project's schema for `id` after auth. The single
 * `projectMeta` read is the ownership + lifecycle gate: it scopes to
 * `deletedAt: null` (so soft-deleted projects behave as missing) and returns
 * `null` when the row is absent or owned by someone else — the caller cannot
 * tell the cases apart, which is deliberate (no existence leak). Callers map
 * the `null` result to a 404.
 */
export async function resolveProjectSchema(id: string, ownerId: string): Promise<string | null> {
  const meta = await getPublicClient().projectMeta.findUnique({
    where: { id, deletedAt: null },
    select: { schemaName: true, ownerId: true },
  });
  if (!meta || meta.ownerId !== ownerId) return null;

  return meta.schemaName;
}
