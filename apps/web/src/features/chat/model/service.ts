/**
 * Chat message data access against a project's own schema (`project_{uuid}`).
 * Mirrors `features/projects/model/service.ts` in shape — a `toView()` helper,
 * soft-delete filters on every read, JSDoc on every export — but reaches the
 * row through `getProjectClient(schemaName)` rather than `getPublicClient()`,
 * because chat history is project-scoped data behind the per-project
 * isolation boundary (docs/03-data-model.md), not platform metadata.
 *
 * Soft-delete (`deletedAt: null` in every `where`) is the architectural
 * invariant from CLAUDE.md and is applied here for both the list and any
 * future read. The view drops `tokensIn` / `tokensOut`: they are persisted
 * for analytics but never displayed, so they do not belong in the DTO.
 */
import { getProjectClient } from '@aiflow/db';

import type { ChatMessageView, SaveMessageInput } from './types';

/** Prisma row → view. Drops `tokensIn`, `tokensOut`, `deletedAt` from the DTO. */
function toView(row: {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  createdAt: Date;
}): ChatMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

/**
 * All non-deleted chat messages in a project, oldest first (chronological
 * order — the transcript is rendered top-to-bottom, so `asc` is the contract
 * the UI relies on, mirroring the `@@index([createdAt])` on the model).
 */
export async function listMessages(schemaName: string): Promise<ChatMessageView[]> {
  const rows = await getProjectClient(schemaName).chatMessage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(toView);
}

/**
 * Persist one chat message in the project's schema. `role` arrives already
 * narrowed to `USER` / `ASSISTANT` via `SaveMessageInput` — `SYSTEM` is never
 * written here (it is read from file in `schema.ts`). Token counts default to
 * `null` so an absent count is stored as NULL, matching the nullable column
 * rather than collapsing "unknown" into 0.
 */
export async function saveMessage(
  schemaName: string,
  input: SaveMessageInput,
): Promise<ChatMessageView> {
  const row = await getProjectClient(schemaName).chatMessage.create({
    data: {
      role: input.role,
      content: input.content,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    },
  });

  return toView(row);
}
