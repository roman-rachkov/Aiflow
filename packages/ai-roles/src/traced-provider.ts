/**
 * Wrap an {@link OpenAICompatibleProvider} so chat/embed calls emit Langfuse
 * generations when a tracer is enabled (MVP-3 B2). No-op tracer = identity.
 */

import type {
  ChatConfig,
  ChatMessage,
  ChatResult,
  ChatWithToolsResult,
  ChatWithUsageResult,
  LiveChatEvent,
  OpenAICompatibleProvider,
} from './types';
import {
  getTracerFromEnv,
  startTracedGeneration,
  type GenerationHandle,
  type LlmTracer,
} from './tracer';

/** Serialize chat messages for Langfuse input (roles as stored). */
function chatInput(messages: ChatMessage[], cfg: ChatConfig): unknown {
  return {
    systemPrompt: cfg.systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: cfg.tools?.map((t) => t.function.name),
  };
}

/** Wrap every provider method with start/end generation spans. */
export function withLlmTracing(
  provider: OpenAICompatibleProvider,
  tracer: LlmTracer = getTracerFromEnv(),
): OpenAICompatibleProvider {
  if (!tracer.enabled) return provider;
  return {
    chat(messages, cfg) {
      return tracedChat(provider, tracer, messages, cfg);
    },
    chatWithUsage(messages, cfg) {
      return tracedChatWithUsage(provider, tracer, messages, cfg);
    },
    chatWithTools(messages, cfg) {
      return tracedChatWithTools(provider, tracer, messages, cfg);
    },
    embed(texts) {
      return tracedEmbed(provider, tracer, texts);
    },
  };
}

async function* tracedChat(
  provider: OpenAICompatibleProvider,
  tracer: LlmTracer,
  messages: ChatMessage[],
  cfg: ChatConfig,
): AsyncGenerator<string> {
  const gen = startTracedGeneration(tracer, {
    name: 'chat',
    model: cfg.model,
    input: chatInput(messages, cfg),
  });
  yield* drainText(provider.chat(messages, cfg), gen);
}

async function tracedChatWithUsage(
  provider: OpenAICompatibleProvider,
  tracer: LlmTracer,
  messages: ChatMessage[],
  cfg: ChatConfig,
): Promise<ChatWithUsageResult> {
  const inner = await provider.chatWithUsage(messages, cfg);
  const gen = startTracedGeneration(tracer, {
    name: 'chat',
    model: cfg.model,
    input: chatInput(messages, cfg),
  });
  return { stream: drainText(inner.stream, gen, () => inner.usage), usage: inner.usage };
}

async function tracedChatWithTools(
  provider: OpenAICompatibleProvider,
  tracer: LlmTracer,
  messages: ChatMessage[],
  cfg: ChatConfig,
): Promise<ChatWithToolsResult> {
  const inner = await provider.chatWithTools(messages, cfg);
  const gen = startTracedGeneration(tracer, {
    name: 'chat-tools',
    model: cfg.model,
    input: chatInput(messages, cfg),
  });
  return { stream: drainEvents(inner.stream, gen, () => inner.usage), usage: inner.usage };
}

async function tracedEmbed(
  provider: OpenAICompatibleProvider,
  tracer: LlmTracer,
  texts: string[],
): Promise<number[][]> {
  const gen = startTracedGeneration(tracer, {
    name: 'embed',
    model: 'embeddings',
    input: { count: texts.length },
  });
  try {
    const vectors = await provider.embed(texts);
    gen.end({ output: { count: vectors.length, dims: vectors[0]?.length ?? 0 } });
    return vectors;
  } catch (err) {
    endError(gen, err);
    throw err;
  }
}

async function* drainText(
  stream: AsyncIterable<string>,
  gen: GenerationHandle,
  usage?: () => Promise<ChatResult>,
): AsyncGenerator<string> {
  const chunks: string[] = [];
  try {
    for await (const chunk of stream) {
      chunks.push(chunk);
      yield chunk;
    }
    await endOk(gen, chunks.join(''), usage);
  } catch (err) {
    endError(gen, err, chunks.join(''));
    throw err;
  }
}

async function* drainEvents(
  stream: AsyncIterable<LiveChatEvent>,
  gen: GenerationHandle,
  usage: () => Promise<ChatResult>,
): AsyncGenerator<LiveChatEvent> {
  const texts: string[] = [];
  try {
    for await (const evt of stream) {
      if (evt.type === 'text') texts.push(evt.text);
      yield evt;
    }
    await endOk(gen, texts.join(''), usage);
  } catch (err) {
    endError(gen, err, texts.join(''));
    throw err;
  }
}

async function endOk(
  gen: GenerationHandle,
  output: string,
  usage?: () => Promise<ChatResult>,
): Promise<void> {
  const u = usage ? await usage().catch(() => null) : null;
  gen.end({ output, tokensIn: u?.tokensIn ?? null, tokensOut: u?.tokensOut ?? null });
}

function endError(gen: GenerationHandle, err: unknown, output?: string): void {
  gen.end({
    output,
    level: 'ERROR',
    statusMessage: err instanceof Error ? err.message : String(err),
  });
}
