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
