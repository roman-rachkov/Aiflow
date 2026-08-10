/**
 * Chat message load/save for chat:run (soft-delete filtered).
 */

import { getProjectClient } from '@aiflow/db';
import type { ChatMessage } from '@aiflow/ai-roles';

/** Thread messages oldest-first as provider ChatMessage[]. */
export async function listMessagesByThread(
  schemaName: string,
  threadId: string,
): Promise<ChatMessage[]> {
  const rows = await getProjectClient(schemaName).chatMessage.findMany({
    where: { threadId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });
  return rows.map((m) => ({ role: m.role, content: m.content }));
}

/** All project messages (SPEC generation). */
export async function listMessages(
  schemaName: string,
): Promise<Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>> {
  const rows = await getProjectClient(schemaName).chatMessage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  });
  return rows;
}

/** Persist an ASSISTANT turn after the run completes. */
export async function saveAssistantMessage(
  schemaName: string,
  input: {
    content: string;
    threadId: string;
    tokensIn: number | null;
    tokensOut: number | null;
  },
): Promise<void> {
  if (input.content.trim().length === 0) return;
  await getProjectClient(schemaName).chatMessage.create({
    data: {
      role: 'ASSISTANT',
      content: input.content,
      threadId: input.threadId,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
    },
  });
}
