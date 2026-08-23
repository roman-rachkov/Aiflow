/**
 * Analyst system prompt + SPEC template from `.claude/agents/analyst.md`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withRagContext as mixRagContext } from '@aiflow/ai-roles';

const here = dirname(fileURLToPath(import.meta.url));
// apps/worker/src/chat → repo root is four `..`.
const SYSTEM_PROMPT_PATH = join(here, '..', '..', '..', '..', '.claude', 'agents', 'analyst.md');

/** Read the Analyst system prompt. Throws if missing. */
export function readSystemPrompt(): string {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`System prompt not found at ${SYSTEM_PROMPT_PATH}: ${message}`);
  }
}

/** Extract the SPEC.md template fenced block from analyst.md. */
export function readSpecTemplate(): string {
  const file = readSystemPrompt();
  const headingIdx = file.indexOf('## SPEC.md format');
  if (headingIdx === -1) throw new Error('SPEC.md format heading not found in analyst.md');
  const after = file.slice(headingIdx);
  const openFence = '```markdown\n';
  const start = after.indexOf(openFence);
  if (start === -1) throw new Error('SPEC.md template opening fence not found');
  const bodyStart = start + openFence.length;
  const end = after.indexOf('\n```', bodyStart);
  if (end === -1) throw new Error('SPEC.md template closing fence not found');
  return after.slice(bodyStart, end);
}

/** Append RAG context (B4 untrusted wrap) to the system prompt when non-empty. */
export function withRagContext(base: string, context: string): string {
  return mixRagContext(base, context);
}
