/**
 * Specification data access against a project's own schema (`project_{uuid}`).
 * Mirrors `features/chat/model/service.ts` and `features/files/model/service.ts`
 * in shape — `toView()` / `toListItemView()` helpers, `getProjectClient(schemaName)`
 * access, soft-delete filters on every read, JSDoc on every export — because
 * specification versions are project-scoped data behind the per-project
 * isolation boundary (docs/03-data-model.md), not platform metadata.
 *
 * `version` is `@@unique`, but `deletedAt` is not part of that unique, so a
 * deleted row still occupies a version number. Reads therefore filter
 * `deletedAt: null`, and version lookup uses `findFirst` (not `findUnique`),
 * which is the cleanest way to exclude soft-deleted rows.
 */
import { getProjectClient } from '@aiflow/db';

import type { SpecificationListItemView, SpecificationView } from './types';

/** Prisma row → full view. Drops `deletedAt`, `approvedAt`, `approvedBy`. */
function toView(row: {
  id: string;
  version: number;
  content: string;
  createdAt: Date;
  createdBy: 'USER' | 'AI';
}): SpecificationView {
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/** Prisma row → list item view. Also drops `content` (bodies are large). */
function toListItemView(row: {
  id: string;
  version: number;
  createdAt: Date;
  createdBy: 'USER' | 'AI';
  approvedAt: Date | null;
}): SpecificationListItemView {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    approvedAt: row.approvedAt,
  };
}

/**
 * All non-deleted specification versions in a project, newest version first.
 * Version is monotonically increasing, so `desc` puts the latest spec at the
 * top — the contract the version list UI relies on.
 */
export async function listSpecifications(schemaName: string): Promise<SpecificationListItemView[]> {
  const rows = await getProjectClient(schemaName).specification.findMany({
    where: { deletedAt: null },
    orderBy: { version: 'desc' },
  });

  return rows.map(toListItemView);
}

/**
 * One specification version, or `null` if missing or soft-deleted. `version`
 * is `@@unique` but `deletedAt` is not part of that unique, so `findFirst`
 * (filtering `deletedAt: null`) is the cleanest way to exclude deleted rows;
 * `findUnique` cannot express the soft-delete filter.
 */
export async function getSpecificationByVersion(
  schemaName: string,
  version: number,
): Promise<SpecificationView | null> {
  const row = await getProjectClient(schemaName).specification.findFirst({
    where: { version, deletedAt: null },
  });

  return row ? toView(row) : null;
}

/**
 * Append the next specification version. The next number is `max(existing) + 1`
 * computed via `aggregate`, defaulting to 1 when the table is empty (Prisma's
 * `_max.version` is `null` then). New versions are authored by the AI, so
 * `createdBy: 'AI'`; `approvedAt` is left `null` until a human approves.
 */
export async function createSpecificationVersion(
  schemaName: string,
  content: string,
): Promise<SpecificationView> {
  const client = getProjectClient(schemaName);
  const aggregate = await client.specification.aggregate({
    _max: { version: true },
  });
  const nextVersion = (aggregate._max.version ?? 0) + 1;

  const row = await client.specification.create({
    data: {
      version: nextVersion,
      content,
      createdBy: 'AI',
    },
  });

  return toView(row);
}
