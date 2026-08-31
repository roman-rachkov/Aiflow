/**
 * Policy unit tests (MVP-3 A4) — Reviewer must not write-commit.
 */

import { describe, expect, it } from 'vitest';

import {
  assertCapability,
  hasCapability,
  PolicyViolationError,
  ROLE_CAPABILITIES,
  runWithRole,
} from './policy';
import { withPolicyGuard } from './policy-guard';
import type { OpenAICompatibleProvider } from './types';

describe('ROLE_CAPABILITIES', () => {
  it('denies write-commit to the Reviewer', () => {
    expect(hasCapability('reviewer', 'write-commit')).toBe(false);
    expect(ROLE_CAPABILITIES.reviewer).not.toContain('write-commit');
  });

  it('allows write-commit for the Coder only among code roles', () => {
    expect(hasCapability('coder', 'write-commit')).toBe(true);
    expect(hasCapability('planner', 'write-commit')).toBe(false);
    expect(hasCapability('analyst', 'write-commit')).toBe(false);
  });
});

describe('assertCapability', () => {
  it('throws PolicyViolationError when Reviewer tries write-commit', () => {
    expect(() => {
      runWithRole('reviewer', () => {
        assertCapability('write-commit');
      });
    }).toThrow(PolicyViolationError);
  });

  it('allows Reviewer verdict', () => {
    expect(() => {
      runWithRole('reviewer', () => {
        assertCapability('verdict');
      });
    }).not.toThrow();
  });

  it('no-ops without an active role (legacy callers)', () => {
    expect(() => {
      assertCapability('write-commit');
    }).not.toThrow();
  });
});

describe('withPolicyGuard', () => {
  it('allows Reviewer LLM chat under role context', async () => {
    const inner: OpenAICompatibleProvider = {
      chat: () =>
        (async function* () {
          await Promise.resolve();
          yield 'x';
        })(),
      chatWithUsage: () => Promise.reject(new Error('unused')),
      chatWithTools: () => Promise.reject(new Error('unused')),
      embed: () => Promise.reject(new Error('unused')),
    };
    const guarded = withPolicyGuard(inner);
    const text = await runWithRole('reviewer', async () => {
      const chunks: string[] = [];
      for await (const c of guarded.chat([], { model: 'm', systemPrompt: 's' })) {
        chunks.push(c);
      }
      return chunks.join('');
    });
    expect(text).toBe('x');
  });
});
