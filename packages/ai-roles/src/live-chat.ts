/**
 * Live streaming path for the OpenAI-compatible provider.
 *
 * Extracted from `openai-compatible.ts` so that file stays focused on the
 * provider factory + embeddings and under the line cap. Three exports:
 * `streamLiveChat` (raw decoded chunks), `liveChatWithUsage` (text + usage),
 * `liveChatWithTools` (text + tool-call events + usage). All share the same
 * SSE plumbing (`parseSseStream`) and chunk mapping (`mapChunk`).
 */

import type {
  ChatConfig,
  ChatMessage,
  ChatResult,
  ChatWithToolsResult,
  ChatWithUsageResult,
  LiveChatEvent,
  ProviderConfig,
  ChatRole,
  ToolCallDelta,
} from './types';
import { parseSseStream, type SseChunk } from './sse-parser';

/** Map an internal role to the OpenAI API role string. */
const ROLE_MAP: Record<ChatRole, string> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

/** A decoded live-stream chunk: text delta, optional tool-call delta, finish, usage. */
export interface LiveChunk {
  text: string;
  toolCallDelta?: ToolCallDelta;
  toolCallsDone?: boolean;
  usage?: ChatResult;
}

/** Build the messages array for the request body (system prompt first). */
function buildApiMessages(
  messages: ChatMessage[],
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: ROLE_MAP[m.role], content: m.content })),
  ];
}

/** Map `chunk.usage` (when present) to a `ChatResult`. */
function mapUsage(chunk: SseChunk): ChatResult | undefined {
  if (!chunk.usage) return undefined;
  return {
    tokensIn: chunk.usage.prompt_tokens ?? null,
    tokensOut: chunk.usage.completion_tokens ?? null,
  };
}

/** Map the first `choices[].delta.tool_calls[]` entry to a `ToolCallDelta`. */
function mapToolCallDelta(chunk: SseChunk): ToolCallDelta | undefined {
  const raw = chunk.choices?.[0]?.delta?.tool_calls?.[0];
  if (!raw) return undefined;
  return {
    index: raw.index,
    id: raw.id,
    name: raw.function?.name,
    arguments: raw.function?.arguments ?? '',
  };
}

/** True when the model signalled tool-call completion on this chunk. */
function isToolCallsDone(chunk: SseChunk): boolean {
  return chunk.choices?.[0]?.finish_reason === 'tool_calls';
}

/** Map an `SseChunk` to a `LiveChunk`, or `undefined` if it carries nothing. */
function mapChunk(chunk: SseChunk): LiveChunk | undefined {
  const text = chunk.choices?.[0]?.delta?.content ?? '';
  const toolCallDelta = mapToolCallDelta(chunk);
  const toolCallsDone = isToolCallsDone(chunk);
  const usage = mapUsage(chunk);
  const empty = text.length === 0 && !usage && !toolCallDelta && !toolCallsDone;
  return empty ? undefined : { text, toolCallDelta, toolCallsDone, usage };
}

/** POST the chat request and yield decoded chunks; throws on non-2xx HTTP. */
export async function* streamLiveChat(
  messages: ChatMessage[],
  cfg: ChatConfig,
  provider: ProviderConfig,
): AsyncGenerator<LiveChunk> {
  const response = await fetch(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: buildApiMessages(messages, cfg.systemPrompt),
      stream: true,
      stream_options: { include_usage: true },
      // Only forwarded when the caller supplied tools (tool-aware /run path).
      ...(cfg.tools && cfg.tools.length > 0 ? { tools: cfg.tools, tool_choice: 'auto' } : {}),
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `OpenAICompatibleProvider: chat request failed (${String(response.status)} ${response.statusText})`,
    );
  }
  for await (const chunk of parseSseStream(response.body)) {
    const mapped = mapChunk(chunk);
    if (mapped) yield mapped;
  }
}

/** Resolve usage once, idempotently, from the first chunk that carries it. */
function trackUsage(): {
  usage: Promise<ChatResult>;
  report: (result: ChatResult) => void;
  finalize: () => void;
} {
  let resolved = false;
  let resolveUsage!: (result: ChatResult) => void;
  const usage = new Promise<ChatResult>((resolve) => {
    resolveUsage = resolve;
  });
  return {
    usage,
    report(result) {
      if (!resolved) {
        resolved = true;
        resolveUsage(result);
      }
    },
    finalize() {
      this.report({ tokensIn: null, tokensOut: null });
    },
  };
}

/** Live path: drive the streaming request and expose token usage. */
export function liveChatWithUsage(
  messages: ChatMessage[],
  cfg: ChatConfig,
  provider: ProviderConfig,
): ChatWithUsageResult {
  const tracker = trackUsage();
  const stream = (async function* liveGen() {
    try {
      for await (const chunk of streamLiveChat(messages, cfg, provider)) {
        yield chunk.text;
        if (chunk.usage) tracker.report(chunk.usage);
      }
    } finally {
      tracker.finalize();
    }
  })();
  return { stream, usage: tracker.usage };
}

/** Live path, tool-aware: surface `LiveChatEvent` deltas with usage side-channel. */
export function liveChatWithTools(
  messages: ChatMessage[],
  cfg: ChatConfig,
  provider: ProviderConfig,
): ChatWithToolsResult {
  const tracker = trackUsage();
  const stream = (async function* liveGen(): AsyncGenerator<LiveChatEvent> {
    try {
      for await (const chunk of streamLiveChat(messages, cfg, provider)) {
        if (chunk.text.length > 0) yield { type: 'text', text: chunk.text };
        if (chunk.toolCallDelta) yield { type: 'tool_call_delta', delta: chunk.toolCallDelta };
        if (chunk.toolCallsDone) yield { type: 'tool_calls_done' };
        if (chunk.usage) tracker.report(chunk.usage);
      }
    } finally {
      tracker.finalize();
    }
  })();
  return { stream, usage: tracker.usage };
}
