import { describe, expect, it } from 'vitest';

import { RAG_UNTRUSTED_END, RAG_UNTRUSTED_START } from '@aiflow/ai-roles';

/**
 * Unit tests for `withRagContext` (schema.ts). Empty context returns the base
 * prompt verbatim; non-empty context is wrapped as untrusted document DATA (B4).
 */

const { withRagContext } = await import('./schema');

describe('withRagContext', () => {
  it('returns the base prompt verbatim when context is empty', () => {
    expect(withRagContext('P', '')).toBe('P');
  });

  it('wraps non-empty context in untrusted delimiters', () => {
    const out = withRagContext('P', 'C');
    expect(out.startsWith('P\n\n')).toBe(true);
    expect(out).toContain(RAG_UNTRUSTED_START);
    expect(out).toContain('C');
    expect(out).toContain(RAG_UNTRUSTED_END);
  });

  it('preserves a multi-line context block inside the wrap', () => {
    const block = 'Контекст из загруженных документов:\n\n[Фрагмент 1]\nAlpha';
    const out = withRagContext('BASE', block);
    expect(out).toContain(block);
    expect(out).toContain(RAG_UNTRUSTED_START);
  });
});
