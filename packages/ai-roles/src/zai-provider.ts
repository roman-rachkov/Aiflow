/**
 * ZaiProvider — model adapter for the z.ai GLM chat models.
 *
 * Two modes, selected once at construction time:
 * - MOCK: `ZAI_API_KEY` unset/empty. Streams a canned Russian analyst
 *   follow-up so local dev and tests run without network.
 * - LIVE: `ZAI_API_KEY` present. Makes a real streaming HTTPS POST to the
 *   OpenAI-compatible z.ai endpoint and yields `choices[0].delta.content`
 *   chunks. Token usage from the final chunk is exposed via `chatWithUsage`.
 *
 * The mock path ignores `config` (early return); the live path needs it for
 * the model id, system prompt, and optional per-request `apiKey` override.
 * The live HTTP/SSE plumbing lives in zai-live.ts; this file holds the mode
 * switch, mock generator, and usage-promise bookkeeping.
 */

import type {
  ChatConfig,
  ChatMessage,
  ChatResult,
  ChatWithUsageResult,
  StreamingProvider,
} from './types';
import { streamLiveChat } from './zai-live';

/** Canned analyst follow-ups; each yields 3+ sentence chunks in mock mode. */
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

/** Split `text` into sentence chunks (whitespace after `.`, `?`, `!`). */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Deterministically pick a canned reply from the last USER message length. */
function pickReply(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'USER') {
      return CANNED_REPLIES[messages[i].content.length % CANNED_REPLIES.length];
    }
  }
  return CANNED_REPLIES[0];
}

/**
 * Wrap `source` so its `usage` resolves to null token counts once the stream is
 * fully consumed — normal completion, early `break`, or error (via `finally`).
 * Used only by the mock path; the live path resolves usage from real tokens.
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
 * predictable point. `ZAI_API_KEY` read once in the constructor; absent or
 * empty ⇒ mock mode, present ⇒ live mode.
 */
export class ZaiProvider implements StreamingProvider {
  private readonly mode: 'mock' | 'live';
  private readonly envKey: string | undefined;

  constructor() {
    const key = process.env.ZAI_API_KEY;
    this.envKey = key && key.length > 0 ? key : undefined;
    this.mode = this.envKey ? 'live' : 'mock';
  }

  /** Stream the assistant reply as text chunks. Mock path ignores `config`. */
  async *chat(messages: ChatMessage[], config: ChatConfig): AsyncIterable<string> {
    if (this.mode === 'mock') {
      yield* this.mockStream(messages);
      return;
    }
    for await (const chunk of streamLiveChat(messages, config, this.resolveKey(config))) {
      yield chunk.text;
    }
  }

  /**
   * Stream the assistant reply and expose token usage as a side-channel. `usage`
   * resolves with real counts in live mode (when the API returns them) or nulls.
   * Never rejects — stream errors are surfaced by throwing from the generator.
   * Returns a Promise to satisfy the {@link StreamingProvider} interface even
   * though the work is synchronous: the inner generator runs lazily on consume.
   */
  chatWithUsage(messages: ChatMessage[], config: ChatConfig): Promise<ChatWithUsageResult> {
    if (this.mode === 'mock') {
      return Promise.resolve(withNullUsageStream(this.mockStream(messages)));
    }
    return Promise.resolve(this.liveWithUsage(messages, config));
  }

  /** Stream a canned reply in sentence chunks with a 30-80ms delay each. */
  private async *mockStream(messages: ChatMessage[]): AsyncGenerator<string> {
    const reply = pickReply(messages);
    for (const chunk of splitIntoSentences(reply)) {
      await delay(randomBetween(30, 80));
      yield chunk;
    }
  }

  /** Live path: drive a real z.ai streaming request and expose token usage. */
  private liveWithUsage(messages: ChatMessage[], config: ChatConfig): ChatWithUsageResult {
    let resolved = false;
    let resolveUsage!: (result: ChatResult) => void;
    const usage = new Promise<ChatResult>((resolve) => {
      resolveUsage = resolve;
    });
    const apiKey = this.resolveKey(config);
    const stream = (async function* liveGen() {
      try {
        for await (const chunk of streamLiveChat(messages, config, apiKey)) {
          yield chunk.text;
          // First real usage chunk wins; subsequent chunks cannot overwrite it.
          if (chunk.usage && !resolved) {
            resolved = true;
            resolveUsage(chunk.usage);
          }
        }
      } finally {
        // Never reject: if no usage chunk arrived (or stream errored), nulls.
        if (!resolved) {
          resolved = true;
          resolveUsage({ tokensIn: null, tokensOut: null });
        }
      }
    })();
    return { stream, usage };
  }

  /** Resolve the API key, preferring a per-request override over the env. */
  private resolveKey(config: ChatConfig): string {
    const apiKey = config.apiKey ?? this.envKey;
    if (!apiKey) {
      throw new Error('ZaiProvider: ZAI_API_KEY required for live mode');
    }
    return apiKey;
  }
}

/**
 * Construct a {@link ZaiProvider}. Reads `ZAI_API_KEY` once at construction.
 * The factory is the seam the route handler uses so the env is not read at
 * module top-level (testable, lazy).
 */
export function createZaiProvider(): ZaiProvider {
  return new ZaiProvider();
}
