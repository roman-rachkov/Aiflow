/**
 * Unit tests for multi-turn loop helpers (history append, usage sum, iter cap).
 */

import { describe, expect, it } from 'vitest';

import { appendToolTurn, MAX_TOOL_ITERS, sumUsage } from './run-loop';

describe('run-loop helpers', () => {
  it('exposes a finite iteration guard', () => {
    expect(MAX_TOOL_ITERS).toBe(5);
  });

  it('sums nullable usage across iterations', () => {
    expect(sumUsage({ tokensIn: 1, tokensOut: null }, { tokensIn: 2, tokensOut: 3 })).toEqual({
      tokensIn: 3,
      tokensOut: 3,
    });
    expect(
      sumUsage({ tokensIn: null, tokensOut: null }, { tokensIn: null, tokensOut: null }),
    ).toEqual({ tokensIn: null, tokensOut: null });
  });

  it('appends assistant toolCalls + TOOL messages in-memory', () => {
    const history: Parameters<typeof appendToolTurn>[0] = [{ role: 'USER', content: 'go' }];
    appendToolTurn(history, '', [
      { id: 'tc1', name: 'list_tasks', args: '{}', resultContent: { tasks: [] } },
    ]);
    expect(history).toEqual([
      { role: 'USER', content: 'go' },
      {
        role: 'ASSISTANT',
        content: '',
        toolCalls: [{ id: 'tc1', name: 'list_tasks', arguments: '{}' }],
      },
      { role: 'TOOL', content: '{"tasks":[]}', toolCallId: 'tc1' },
    ]);
  });
});
