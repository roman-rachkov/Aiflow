/**
 * Chat thread CRUD against a project's own schema (`project_{uuid}`).
 *
 * Threads back the OpenUI AgentInterface ThreadList — the sidebar list of
 * conversations a project holds. Forking copies the source thread's messages
 * into a new thread so the branch diverges from a known lineage (`forkedFromId`
 * records where it came from). Every read filters `deletedAt: null` per the
 * soft-delete invariant; delete sets `deletedAt`, never `.delete()`.
 */
import { getProjectClient } from '@aiflow/db';

import type {
  ChatMessageView,
  ChatThreadView,
  CreateThreadInput,
  UpdateThreadInput,
} from './types';

const DEFAULT_TITLE = 'Новый чат';

/** Prisma row → view. Drops `deletedAt` from the DTO. */
function toThreadView(row: {
  id: string;
  title: string;
  forkedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ChatThreadView {
  return {
    id: row.id,
    title: row.title,
    forkedFromId: row.forkedFromId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Prisma message row → message view (mirrors `service.toView`). */
function toMessageView(row: {
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
 * Non-deleted threads, newest-update first. The ThreadList shows recent
 * activity on top, so ordering by `updatedAt desc` matches the UI contract.
 */
export async function listThreads(schemaName: string): Promise<ChatThreadView[]> {
  const rows = await getProjectClient(schemaName).chatThread.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });

  return rows.map(toThreadView);
}

/** One non-deleted thread by id, or null when missing/soft-deleted. */
export async function getThread(
  schemaName: string,
  threadId: string,
): Promise<ChatThreadView | null> {
  const row = await getProjectClient(schemaName).chatThread.findFirst({
    where: { id: threadId, deletedAt: null },
  });

  return row ? toThreadView(row) : null;
}

/** Create a new thread. Title defaults to "Новый чат" when not provided. */
export async function createThread(
  schemaName: string,
  input: CreateThreadInput = {},
): Promise<ChatThreadView> {
  const row = await getProjectClient(schemaName).chatThread.create({
    data: {
      title: input.title?.trim() || DEFAULT_TITLE,
      forkedFromId: input.forkedFromId ?? null,
    },
  });

  return toThreadView(row);
}

/** Derive a thread title from its first user message (max 60 chars). */
function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return DEFAULT_TITLE;
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/**
 * Create a thread seeded with the first user message and a derived title. This
 * is the ThreadStorage.createThread flow: the client sends the first message,
 * the backend opens a thread titled from it and persists the message in one go.
 */
export async function createThreadWithMessage(
  schemaName: string,
  firstMessage: { role: 'USER'; content: string },
  forkedFromId?: string,
): Promise<{ thread: ChatThreadView; message: ChatMessageView }> {
  const client = getProjectClient(schemaName);
  const thread = await client.chatThread.create({
    data: {
      title: deriveTitle(firstMessage.content),
      forkedFromId: forkedFromId ?? null,
    },
  });
  const message = await client.chatMessage.create({
    data: { role: 'USER', content: firstMessage.content, threadId: thread.id },
  });

  return { thread: toThreadView(thread), message: toMessageView(message) };
}

/**
 * Rename a thread. The only mutable field besides soft-delete. Returns the
 * updated view, or null when the thread is missing (so the route can 404). Uses
 * `updateMany` to surface "not found" as a count rather than a thrown P2025.
 */
export async function updateThread(
  schemaName: string,
  threadId: string,
  input: UpdateThreadInput,
): Promise<ChatThreadView | null> {
  const result = await getProjectClient(schemaName).chatThread.updateMany({
    where: { id: threadId, deletedAt: null },
    data: { ...(input.title !== undefined ? { title: input.title } : {}) },
  });
  if (result.count === 0) return null;

  const row = await getProjectClient(schemaName).chatThread.findFirst({
    where: { id: threadId, deletedAt: null },
  });
  return row ? toThreadView(row) : null;
}

/** Soft-delete a thread (sets `deletedAt`). Its messages are orphaned, not removed. */
export async function deleteThread(schemaName: string, threadId: string): Promise<void> {
  await getProjectClient(schemaName).chatThread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Fork a thread: create a new thread linked by `forkedFromId`, then copy the
 * source's non-deleted messages into it (new ids, same order/content/role).
 * Returns the new thread and its copied messages. The branch then diverges as
 * the user edits or continues from the copy.
 */
export async function forkThread(
  schemaName: string,
  sourceThreadId: string,
  title?: string,
): Promise<{ thread: ChatThreadView; messages: ChatMessageView[] } | null> {
  const client = getProjectClient(schemaName);
  const source = await client.chatThread.findFirst({
    where: { id: sourceThreadId, deletedAt: null },
  });
  if (!source) return null;

  const fork = await client.chatThread.create({
    data: { title: title?.trim() || `${source.title} (копия)`, forkedFromId: source.id },
  });

  const sourceMessages = await client.chatMessage.findMany({
    where: { threadId: sourceThreadId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  const copied: ChatMessageView[] = [];
  for (const m of sourceMessages) {
    const row = await client.chatMessage.create({
      data: { role: m.role, content: m.content, threadId: fork.id },
    });
    copied.push(toMessageView(row));
  }

  return { thread: toThreadView(fork), messages: copied };
}
