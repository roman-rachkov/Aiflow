/**
 * Mock chat path for the OpenAI-compatible provider: streams a canned Russian
 * analyst follow-up so local dev and tests run without network or a key.
 *
 * Extracted from the former `ZaiProvider` mock body so `openai-compatible.ts`
 * stays under the 200-line file limit. `withNullUsageStream` wraps the canned
 * generator so `chatWithUsage` resolves usage to nulls once the stream drains.
 */

import type { ChatMessage, ChatResult, ChatWithUsageResult } from './types';

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

/** Stream a canned reply in sentence chunks with a 30-80ms delay each. */
export async function* mockChatStream(messages: ChatMessage[]): AsyncGenerator<string> {
  const reply = pickReply(messages);
  for (const chunk of splitIntoSentences(reply)) {
    await delay(randomBetween(30, 80));
    yield chunk;
  }
}

/**
 * Wrap `source` so its `usage` resolves to null token counts once the stream is
 * fully consumed — normal completion, early `break`, or error (via `finally`).
 */
export function withNullUsageStream(source: AsyncIterable<string>): ChatWithUsageResult {
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
