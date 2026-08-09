/**
 * Chat message data access against a project's own schema (`project_{uuid}`).
 * Mirrors `features/projects/model/service.ts` in shape — a `toView()` helper,
 * soft-delete filters on every read, JSDoc on every export — but reaches the
 * row through `getProjectClient(schemaName)` rather than `getPublicClient()`,
 * because chat history is project-scoped data behind the per-project
 * isolation boundary (docs/03-data-model.md), not platform metadata.
 *
 * Soft-delete (`deletedAt: null` in every `where`) is the architectural
 * invariant from CLAUDE.md and is applied here for every read. The view drops
 * `tokensIn` / `tokensOut`: they are persisted for analytics but never
 * displayed, so they do not belong in the DTO. Thread CRUD lives in
 * `./threads`; this module owns messages only.
 */
import { getProjectClient } from '@aiflow/db';

import type { ChatMessageView, SaveMessageInput } from './types';

/** Prisma row → view. Drops `tokensIn`, `tokensOut`, `deletedAt` from the DTO. */
function toView(row: {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  threadId: string | null;
  parentId: string | null;
  createdAt: Date;
}): ChatMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    threadId: row.threadId,
    parentId: row.parentId,
    createdAt: row.createdAt,
  };
}

/**
 * Non-deleted chat messages of one thread, oldest first. Chronological order —
 * the transcript renders top-to-bottom, so `asc` is the contract the UI relies
 * on, mirroring the `@@index([createdAt])` on the model.
 */
export async function listMessagesByThread(
  schemaName: string,
  threadId: string,
): Promise<ChatMessageView[]> {
  const rows = await getProjectClient(schemaName).chatMessage.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map(toView);
}

/**
 * All non-deleted chat messages in a project regardless of thread, oldest
 * first. Used for SPEC generation (the whole transcript feeds the Analyst) and
 * the legacy "global transcript" reads until the UI is fully thread-based.
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
 * written here (it is read from file in `schema.ts`). `threadId` ties the row
 * to a thread; `parentId` links it to the message it replaces (edit/regen).
 * Token counts default to `null` so an absent count is stored as NULL, matching
 * the nullable column rather than collapsing "unknown" into 0.
 */
export async function saveMessage(
  schemaName: string,
  input: SaveMessageInput,
): Promise<ChatMessageView> {
  const row = await getProjectClient(schemaName).chatMessage.create({
    data: {
      role: input.role,
      content: input.content,
      threadId: input.threadId ?? null,
      parentId: input.parentId ?? null,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    },
  });

  return toView(row);
}

/**
 * Soft-delete one message (sets `deletedAt`, never `.delete()`). The grown-up
 * chat UI exposes delete per message; this honours the soft-delete invariant.
 */
export async function deleteMessage(schemaName: string, messageId: string): Promise<void> {
  await getProjectClient(schemaName).chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Edit one message's content in place. Used by the in-chat edit action: the
 * headless store updates the in-memory message, and this call persists the new
 * text so the edit survives a thread reload. Returns the updated view, or null
 * when the message is missing (so the route can 404). `updateMany` surfaces
 * "not found" as a count rather than a thrown P2025.
 */
export async function updateMessageContent(
  schemaName: string,
  messageId: string,
  content: string,
): Promise<ChatMessageView | null> {
  const result = await getProjectClient(schemaName).chatMessage.updateMany({
    where: { id: messageId, deletedAt: null },
    data: { content },
  });
  if (result.count === 0) return null;

  const row = await getProjectClient(schemaName).chatMessage.findFirst({
    where: { id: messageId, deletedAt: null },
  });
  return row ? toView(row) : null;
}
