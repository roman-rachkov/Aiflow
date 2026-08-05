/**
 * ZaiProvider — model adapter for the z.ai GLM chat models.
 *
 * This file currently ships only the MOCK path: when `ZAI_API_KEY` is unset or
 * empty the provider streams a canned Russian analyst follow-up so local dev
 * and the test suite run without network. The live HTTP path (real streaming
 * via the OpenAI-compatible z.ai endpoint) is added by task 5; until then any
 * instance constructed with a key throws a clear "not implemented" error from
 * both `chat` and `chatWithUsage` rather than silently faking a reply.
 *
 * The mock splits a fixed multi-sentence reply into chunks and yields them
 * with a small delay so consumers exercise real async streaming.
 */

import type { ChatMessage, ChatResult, ChatWithUsageResult, StreamingProvider } from './types';

/** Error raised by the not-yet-implemented live HTTP path (task 5). */
const LIVE_NOT_IMPLEMENTED = 'ZaiProvider live path not implemented — set in task 5';

/**
 * Canned analyst follow-ups. Each is a 3-sentence Russian reply ending in a
 * question, so sentence-chunking reliably yields 3+ streaming chunks.
 */
const CANNED_REPLIES: readonly string[] = [
  'Понял вас. Расскажите подробнее, для кого это приложение? Это поможет точнее описать целевую аудиторию.',
  'Хороший вопрос. Что должно происходить на главном экране? Опишите основные действия пользователя.',
  'Спасибо за уточнение. Какие данные нужно хранить? Перечислите сущности и их поля.',
  'Понятно. Нужна ли аутентификация пользователей? Если да, уточните способы входа.',
  'Отлично. Есть ли предпочтения по дизайну? Укажите референсы или желаемый стиль.',
];

/** Resolve after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random integer in the inclusive range [min, max]. */
function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Split `text` into sentence chunks. Breaks on whitespace that follows
 * sentence-ending punctuation (`.`, `?`, `!`), keeping the punctuation attached
 * to its sentence. Empty fragments are dropped.
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Pick a canned reply deterministically from the last USER message length so
 * repeated calls with the same input return the same reply (stable for tests).
 * Falls back to the first reply when no USER message is present.
 */
function pickReply(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'USER') {
      return CANNED_REPLIES[messages[i].content.length % CANNED_REPLIES.length];
    }
  }
  return CANNED_REPLIES[0];
}

/**
 * Wrap `source` so its `usage` side-channel resolves to null token counts once
 * the stream is fully consumed — on normal completion, early `break`, or error
 * (via the wrapper's `finally`). The wrapper delegates to `source` via
 * `yield*`, so the consumer sees the same chunks with the same timing.
 */
function withNullUsageStream(source: AsyncIterable<string>): ChatWithUsageResult {
  let resolveUsage!: (result: ChatResult) => void;
  const usage = new Promise<ChatResult>((resolve) => {
    resolveUsage = resolve;
  });
  const stream = (async function* nullUsageStream() {
    try {
      yield* source;
    } finally {
      resolveUsage({ tokensIn: null, tokensOut: null });
    }
  })();
  return { stream, usage };
}

/**
 * Adapter for the z.ai GLM models implementing {@link StreamingProvider}.
 * Construct via {@link createZaiProvider} so the env is read at a single,
 * predictable point. Reads `ZAI_API_KEY` once at construction; absent or empty
 * ⇒ mock mode, present ⇒ live mode (currently throws "not implemented").
 */
export class ZaiProvider implements StreamingProvider {
  private readonly mode: 'mock' | 'live';

  constructor() {
    const key = process.env.ZAI_API_KEY;
    this.mode = key && key.length > 0 ? 'live' : 'mock';
  }

  /**
   * Stream the assistant reply as text chunks. Throws in live mode (task 5).
   * The `config` parameter from {@link StreamingProvider.chat} is intentionally
   * omitted: a method with fewer params still satisfies the interface, and the
   * mock path does not consult it. The live path (task 5) will add it back.
   */
  async *chat(messages: ChatMessage[]): AsyncIterable<string> {
    if (this.mode === 'live') {
      throw new Error(LIVE_NOT_IMPLEMENTED);
    }
    yield* this.mockStream(messages);
  }

  /**
   * Stream the assistant reply and resolve `usage` to null token counts once
   * the stream ends. Throws synchronously in live mode (task 5). See `chat`
   * for why the `config` parameter is omitted here.
   */
  chatWithUsage(messages: ChatMessage[]): Promise<ChatWithUsageResult> {
    if (this.mode === 'live') {
      throw new Error(LIVE_NOT_IMPLEMENTED);
    }
    return Promise.resolve(withNullUsageStream(this.mockStream(messages)));
  }

  /** Stream a canned reply in sentence chunks with a 30-80ms delay each. */
  private async *mockStream(messages: ChatMessage[]): AsyncGenerator<string> {
    const reply = pickReply(messages);
    for (const chunk of splitIntoSentences(reply)) {
      await delay(randomBetween(30, 80));
      yield chunk;
    }
  }
}

/**
 * Construct a {@link ZaiProvider}. Reads `ZAI_API_KEY` once at build time:
 * absent or empty ⇒ mock mode; present ⇒ live mode (currently throws "not
 * implemented"). The factory is the seam the route handler uses so the env is
 * not read at module top-level (testable, lazy).
 */
export function createZaiProvider(): ZaiProvider {
  return new ZaiProvider();
}
