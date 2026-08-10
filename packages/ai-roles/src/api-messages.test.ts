import { describe, expect, it } from 'vitest';

import { buildApiMessages } from './api-messages';
import type { ChatMessage } from './types';

describe('buildApiMessages', () => {
  it('prefixes the system prompt and maps plain roles', () => {
    const messages: ChatMessage[] = [
      { role: 'USER', content: 'hi' },
      { role: 'ASSISTANT', content: 'hello' },
    ];
    expect(buildApiMessages(messages, 'sys')).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('emits assistant tool_calls and tool result messages for multi-turn', () => {
    const messages: ChatMessage[] = [
      { role: 'USER', content: 'сделай спеку и план' },
      {
        role: 'ASSISTANT',
        content: '',
        toolCalls: [{ id: 'tc1', name: 'spec:generate', arguments: '{}' }],
      },
      {
        role: 'TOOL',
        content: '{"id":"s1","version":1}',
        toolCallId: 'tc1',
      },
    ];
    expect(buildApiMessages(messages, '')).toEqual([
      { role: 'system', content: '' },
      { role: 'user', content: 'сделай спеку и план' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'spec:generate', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', content: '{"id":"s1","version":1}', tool_call_id: 'tc1' },
    ]);
  });
});
