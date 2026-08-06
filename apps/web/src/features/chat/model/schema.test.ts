import { describe, expect, it } from 'vitest';

/**
 * Unit tests for `withRagContext` (schema.ts). The branching is the SPEC
 * contract: an empty (falsy) context — no documents, no matches, or an embed
 * failure that degrades to chat-without-RAG — returns the base prompt verbatim
 * (task 1.3 behavior); a non-empty context block is appended after one blank
 * line. `readSystemPrompt` is intentionally NOT covered here to keep this file
 * focused on the pure string transform — it performs a filesystem read of
 * `.claude/agents/analyst.md` which is orthogonal to the RAG-mixing logic.
 */

const { withRagContext } = await import('./schema');

describe('withRagContext', () => {
  it('returns the base prompt verbatim when context is empty', () => {
    expect(withRagContext('P', '')).toBe('P');
  });

  it('appends non-empty context after one blank line', () => {
    expect(withRagContext('P', 'C')).toBe('P\n\nC');
  });

  it('preserves a multi-line context block verbatim', () => {
    const block = 'Контекст из загруженных документов:\n\n[Фрагмент 1]\nAlpha';
    expect(withRagContext('BASE', block)).toBe(`BASE\n\n${block}`);
  });
});
