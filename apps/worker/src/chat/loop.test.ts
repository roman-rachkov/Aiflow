import { describe, expect, it } from 'vitest';

import { validateChatRunPayload, type ChatRunPayload } from '@aiflow/queue';

import { appendToolTurn, MAX_TOOL_ITERS, sumUsage } from './loop';

const base: ChatRunPayload = {
  projectId: 'p1',
  schemaName: 'project_p1',
  threadId: 't1',
  runId: 'r1',
  ownerId: 'u1',
  uiMode: 'BASIC',
  userMessage: 'hi',
};

describe('validateChatRunPayload', () => {
  it('accepts a valid payload', () => {
    expect(() => {
      validateChatRunPayload(base);
    }).not.toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => {
      validateChatRunPayload({ ...base, runId: '' });
    }).toThrow(/missing runId/);
  });

  it('rejects bad uiMode', () => {
    expect(() => {
      validateChatRunPayload({ ...base, uiMode: 'ADMIN' as ChatRunPayload['uiMode'] });
    }).toThrow(/uiMode/);
  });
});

describe('chat loop helpers', () => {
  it('exposes MAX_TOOL_ITERS = 5', () => {
    expect(MAX_TOOL_ITERS).toBe(5);
  });

  it('sums nullable usage', () => {
    expect(sumUsage({ tokensIn: 1, tokensOut: null }, { tokensIn: null, tokensOut: 2 })).toEqual({
      tokensIn: 1,
      tokensOut: 2,
    });
  });

  it('appends assistant toolCalls + TOOL messages', () => {
    const history: Parameters<typeof appendToolTurn>[0] = [];
    appendToolTurn(history, 'calling', [
      { id: 'c1', name: 'list_tasks', args: '{}', resultContent: { tasks: [] } },
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]?.role).toBe('ASSISTANT');
    expect(history[0]?.toolCalls?.[0]?.name).toBe('list_tasks');
    expect(history[1]?.role).toBe('TOOL');
    expect(history[1]?.toolCallId).toBe('c1');
  });
});
