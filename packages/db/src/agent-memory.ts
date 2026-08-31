/**
 * Agent memory store/retrieve — MVP-3 C2 (Reflexion).
 * Persists lessons learned from Reviewer verdicts inside each project schema.
 * Coder and Reviewer both read lessons before their next attempt.
 */

import type { AgentRole } from '../generated/project';
import { getProjectClient } from './index';

export type { AgentRole };

export type StoreMemoryInput = {
  taskId: string;
  role: AgentRole;
  lesson: string;
};

export type MemoryRow = {
  id: string;
  taskId: string;
  role: AgentRole;
  lesson: string;
  createdAt: Date;
};

export type RetrieveMemoryInput = {
  taskId: string;
  role?: AgentRole;
  limit?: number;
};

/** Persist one lesson in the project schema. Soft-delete never applied here —
 * lessons are immutable facts; they are hidden via deletedAt only on explicit
 * administrative purge. */
export async function storeLesson(schemaName: string, input: StoreMemoryInput): Promise<MemoryRow> {
  const row = await getProjectClient(schemaName).agentMemory.create({
    data: {
      taskId: input.taskId,
      role: input.role,
      lesson: input.lesson,
    },
    select: { id: true, taskId: true, role: true, lesson: true, createdAt: true },
  });
  return row;
}

/** Retrieve recent non-deleted lessons for a task, optionally filtered by role.
 * Returns up to `limit` rows (default 5), newest first. */
export async function retrieveLessons(
  schemaName: string,
  input: RetrieveMemoryInput,
): Promise<MemoryRow[]> {
  const rows = await getProjectClient(schemaName).agentMemory.findMany({
    where: {
      taskId: input.taskId,
      deletedAt: null,
      ...(input.role ? { role: input.role } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: input.limit ?? 5,
    select: { id: true, taskId: true, role: true, lesson: true, createdAt: true },
  });
  return rows;
}
