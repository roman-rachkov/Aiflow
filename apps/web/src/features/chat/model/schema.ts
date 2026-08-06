/**
 * Reads the Analyst's system prompt from disk at call time.
 *
 * The system prompt lives in `.claude/agents/analyst.md` at the repository
 * root and is the single source of truth — it is not copied into the database,
 * not cached in this module, and not memoised. Each call re-reads the file so
 * an edit to the agent definition takes effect on the next message without a
 * redeploy of the process or a cache invalidation hook. The cost is one
 * `stat` + `read` per assistant turn, which is negligible next to an LLM
 * round-trip.
 *
 * The path is resolved relative to this module, NOT `process.cwd()`: in the
 * Next.js dev server `process.cwd()` is `apps/web/`, while in the production
 * container it is the repo root. Anchoring to the file location is stable in
 * both. Synchronous on purpose: the result is needed before the request to
 * the provider can be built, and there is no concurrent work to overlap it
 * with.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// From apps/web/src/features/chat/model/ up to the repo root is six `..`.
const SYSTEM_PROMPT_PATH = join(
  here,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '.claude',
  'agents',
  'analyst.md',
);

/** Read the Analyst system prompt. Throws a clear error if the file is missing. */
export function readSystemPrompt(): string {
  try {
    return readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `System prompt not found at ${SYSTEM_PROMPT_PATH}. The Analyst agent definition is required to build a chat turn. Underlying error: ${message}`,
    );
  }
}

/**
 * Read the SPEC.md template block from the Analyst agent definition.
 *
 * The template lives in `.claude/agents/analyst.md` under the
 * `## SPEC.md format` heading, inside a `markdown` fenced code block. SPEC
 * generation feeds this exact block to the model as the structure to follow,
 * so section headings stay fixed (the Planner parses them) while prose inside
 * is generated in the user's language. Same file and same module-relative
 * path resolution as {@link readSystemPrompt}; re-read on every call so an
 * edit to the agent definition takes effect without a redeploy.
 */
export function readSpecTemplate(): string {
  const file = readSystemPrompt();
  const headingIdx = file.indexOf('## SPEC.md format');
  if (headingIdx === -1) {
    throw new Error('SPEC.md format heading not found in analyst.md');
  }
  const after = file.slice(headingIdx);
  const openFence = '```markdown\n';
  const start = after.indexOf(openFence);
  if (start === -1) {
    throw new Error('SPEC.md template opening fence not found in analyst.md');
  }
  const bodyStart = start + openFence.length;
  const end = after.indexOf('\n```', bodyStart);
  if (end === -1) {
    throw new Error('SPEC.md template closing fence not found in analyst.md');
  }
  return after.slice(bodyStart, end);
}

/**
 * Mix RAG context into the Analyst system prompt (SPEC assumption #8).
 *
 * The retrieval context is appended implicitly — the chat UI is unchanged and
 * the user message still reads as a plain turn. When `context` is empty
 * (falsy) — no indexed documents, no matching chunks, or an embed/retrieval
 * failure that degrades to chat-without-RAG — the base prompt is returned
 * verbatim, identical to task 1.3 behavior. Otherwise the context block (a
 * Russian `Контекст из загруженных документов:` body produced by
 * `retrieveContext` in `@/features/files`) is appended after one blank line.
 */
export function withRagContext(basePrompt: string, context: string): string {
  if (!context) return basePrompt;
  return `${basePrompt}\n\n${context}`;
}
