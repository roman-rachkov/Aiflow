/**
 * Agent memory helpers for the Reviewer (MVP-3 C2 Reflexion).
 * Extracts a lesson string from a ReviewVerdict and persists it in project schema.
 */

import type { ReviewVerdict } from '@aiflow/ai-roles';
import type { AgentRole, MemoryRow, StoreMemoryInput } from '@aiflow/db';

export type LessonStoreDeps = {
  storeLesson: (schemaName: string, input: StoreMemoryInput) => Promise<MemoryRow>;
};

export type StoreLessonInput = {
  schemaName: string;
  taskId: string;
  taskTitle: string;
  verdict: ReviewVerdict;
};

/**
 * Extract a one-sentence lesson from a verdict.
 * The lesson is stored in `AgentMemory` so future runs avoid the same mistake.
 */
export function extractLesson(verdict: ReviewVerdict, taskTitle: string): string {
  const parts: string[] = [`Task "${taskTitle}": ${verdict.summary}`];
  const topIssue = verdict.details.issues.find((i) => i.severity === 'error');
  if (topIssue) {
    parts.push(`Key error in ${topIssue.file}: ${topIssue.description}`);
  }
  if (verdict.details.suggestions) {
    parts.push(`Suggestion: ${verdict.details.suggestions}`);
  }
  return parts.join('. ');
}

/** Determine the role tag for a verdict: REVIEWER lessons teach future Reviewers. */
export function verdictRole(verdict: ReviewVerdict): AgentRole {
  return verdict.verdict === 'ACCEPTED' ? 'REVIEWER' : 'REVIEWER';
}

/** Store a lesson extracted from the verdict (called for both ACCEPTED and REJECTED). */
export async function storeLessonFromVerdict(
  input: StoreLessonInput,
  deps: LessonStoreDeps,
): Promise<void> {
  const lesson = extractLesson(input.verdict, input.taskTitle);
  await deps.storeLesson(input.schemaName, {
    taskId: input.taskId,
    role: 'REVIEWER',
    lesson,
  });
}
