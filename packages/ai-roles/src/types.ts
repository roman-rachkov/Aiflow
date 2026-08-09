/**
 * Type surface for `@aiflow/ai-roles`.
 *
 * This package is a leaf: it carries no runtime code and no `@aiflow/`
 * dependencies — only the contracts a model provider must satisfy. Concrete
 * providers (via {@link createOpenAICompatibleProvider} /
 * {@link createProviderFromEnv}) implement these interfaces; the route handler
 * consumes them.
 *
 * Definitions follow SPEC § "ModelRouter адаптер" (task 1.3). `ChatResult` and
 * `StreamingProvider` extend that minimal contract with a side-channel for
 * usage stats without disturbing the bare `chat()` streaming signature.
 */

/** Role of a participant in a chat conversation. */
export type ChatRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

/** A single message in a chat conversation. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Configuration handed to a provider for a single chat call. */
export interface ChatConfig {
  model: string;
  apiKey?: string;
  systemPrompt: string;
  /** Optional function-tools; when present the model may emit tool calls. */
  tools?: ToolDefinition[];
}

/**
 * An OpenAI-style function-tool definition. When `ChatConfig.tools` is provided
 * the provider forwards these to the model so it may emit tool calls; the
 * caller (the `/run` route) is responsible for executing them. The shape is the
 * OpenAI `tools` payload verbatim so it passes through to the chat-completions
 * body without translation.
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * One streamed tool-call delta, decoded from the OpenAI
 * `choices[].delta.tool_calls[]` array. `index` identifies the call position
 * (a model may emit several); `id` arrives on the first delta for a call,
 * `name` on the first delta, and `arguments` is appended across deltas as a
 * partial-JSON string.
 */
export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * A streaming event from a tool-aware chat call. Either a text delta, a
 * tool-call delta, or a terminal `tool_calls` finish (the model chose to call
 * tools instead of, or before, replying). Mirrors what `/run` re-emits as
 * AG-UI events; the provider surfaces raw deltas, the route translates.
 */
export type LiveChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call_delta'; delta: ToolCallDelta }
  | { type: 'tool_calls_done' };

/**
 * Token usage for a completed chat call. Counts are nullable: a mock provider
 * that cannot measure usage reports `null`, a real provider reports the values
 * extracted from the final stream chunk. The route handler reads these after
 * the stream ends to persist them on the `ChatMessage` row.
 */
export interface ChatResult {
  tokensIn: number | null;
  tokensOut: number | null;
}

/**
 * Minimal contract for a chat model. `chat` streams the assistant's reply as
 * text chunks; it throws on error. Providers that only need to stream text
 * implement just this interface.
 */
export interface ModelProvider {
  /** Stream the assistant reply as text chunks. Throws on error. */
  chat(messages: ChatMessage[], config: ChatConfig): AsyncIterable<string>;
}

/**
 * Result of a usage-aware chat call: the streamed text plus a promise that
 * resolves with token counts once the stream completes (or rejects if the
 * stream errors). The consumer drains `stream` first, then awaits `usage`.
 */
export interface ChatWithUsageResult {
  stream: AsyncIterable<string>;
  usage: Promise<ChatResult>;
}

/**
 * Result of a tool-aware chat call: a `LiveChatEvent` stream (text deltas +
 * tool-call deltas + a terminal `tool_calls_done`) plus the usage side-channel.
 * The `/run` route drains `stream`, translating events to AG-UI frames, then
 * awaits `usage`. The plain-text `chatWithUsage` path is unchanged for callers
 * that do not need tools (planner, SPEC generation).
 */
export interface ChatWithToolsResult {
  stream: AsyncIterable<LiveChatEvent>;
  usage: Promise<ChatResult>;
}

/**
 * A provider that, in addition to streaming text, reports token usage. The
 * `stream` is consumed first; `usage` resolves only after the stream ends, so
 * the caller can await it to read the final `ChatResult`. The OpenAI-compatible
 * provider implements this so the route handler can persist usage stats.
 */
export interface StreamingProvider extends ModelProvider {
  /**
   * Stream the assistant reply and expose token usage as a side-channel.
   * `usage` resolves after `stream` is fully consumed.
   */
  chatWithUsage(messages: ChatMessage[], config: ChatConfig): Promise<ChatWithUsageResult>;
  /**
   * Tool-aware streaming variant. When `config.tools` is set, the model may
   * emit tool-call deltas instead of (or before) text; the `LiveChatEvent`
   * stream surfaces both, plus a terminal `tool_calls_done`. Callers without
   * tools keep using `chatWithUsage`. MOCK providers emit a canned text stream.
   */
  chatWithTools(messages: ChatMessage[], config: ChatConfig): Promise<ChatWithToolsResult>;
}

/**
 * A provider that maps input texts to dense vectors. The vectors are ordered
 * to match the input array; downstream code (e.g. pgvector for RAG) writes them
 * as-is. Dimension is provider/model-specific (nomic-embed-text-v1.5 is 768).
 */
export interface EmbeddingsProvider {
  /** Embed each input text; returns one vector per input, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Config handed to {@link createOpenAICompatibleProvider}. `baseURL` is the API
 * root (no `/chat/completions` suffix); `apiKey` absent/empty selects MOCK mode.
 */
export interface ProviderConfig {
  baseURL: string;
  apiKey?: string;
  chatModel: string;
  embeddingModel: string;
}

/**
 * A provider that speaks the OpenAI-compatible chat-completions + embeddings
 * surface (z.ai GLM, OpenAI, local servers, ...). Combines streaming chat with
 * a usage side-channel and text embeddings under one adapter.
 */
export interface OpenAICompatibleProvider extends StreamingProvider, EmbeddingsProvider {}
