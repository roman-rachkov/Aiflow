/**
 * Map internal {@link ChatMessage}s onto the OpenAI chat-completions wire
 * shape — including assistant `tool_calls` and `role: tool` result messages
 * needed for multi-turn tool loops.
 */

import type { ChatMessage, ChatRole } from './types';

/** Map an internal role to the OpenAI API role string. */
const ROLE_MAP: Record<ChatRole, string> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
  TOOL: 'tool',
};

/** One message object in the OpenAI chat-completions `messages` array. */
export type ApiMessage = {
  role: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

/** Build the messages array for the request body (system prompt first). */
export function buildApiMessages(messages: ChatMessage[], systemPrompt: string): ApiMessage[] {
  return [{ role: 'system', content: systemPrompt }, ...messages.map(toApiMessage)];
}

/** Map one internal message to the OpenAI wire shape. */
function toApiMessage(m: ChatMessage): ApiMessage {
  if (m.role === 'TOOL') {
    return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
  }
  if (m.role === 'ASSISTANT' && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return { role: ROLE_MAP[m.role], content: m.content };
}
