import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('stabilization runner', () => {
  it('defines evals, load isolation, and dogfood-smoke steps', () => {
    const src = readFileSync(join(import.meta.dirname, 'run.ts'), 'utf8');
    expect(src).toContain("'evals'");
    expect(src).toContain('isolation.test.ts');
    expect(src).toContain('dogfood-smoke');
  });
});
