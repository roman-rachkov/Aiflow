import { describe, expect, it, vi } from 'vitest';

import {
  buildReviewUserPrompt,
  extractJsonObject,
  generateReviewVerdict,
  parseReviewVerdict,
  type ReviewVerdict,
} from './reviewer';
import type { ModelProvider } from './types';

const SAMPLE: ReviewVerdict = {
  verdict: 'ACCEPTED',
  confidence: 0.9,
  summary: 'Acceptance met; checks green.',
  details: {
    acceptance_met: true,
    compilation: true,
    lint: true,
    tests: null,
    issues: [],
    suggestions: '',
  },
};

function mockProvider(texts: string[]): {
  provider: ModelProvider;
  chat: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const chat = vi.fn((): AsyncIterable<string> => {
    const text = texts[Math.min(i, texts.length - 1)] ?? '';
    i += 1;
    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let yielded = false;
        return {
          next(): Promise<IteratorResult<string>> {
            if (yielded) {
              return Promise.resolve({ value: undefined, done: true });
            }
            yielded = true;
            return Promise.resolve({ value: text, done: false });
          },
        };
      },
    };
  });
  return { provider: { chat }, chat };
}

describe('parseReviewVerdict', () => {
  it('parses a raw JSON object', () => {
    const v = parseReviewVerdict(JSON.stringify(SAMPLE));
    expect(v.verdict).toBe('ACCEPTED');
    expect(v.confidence).toBe(0.9);
  });

  it('accepts fenced JSON', () => {
    const raw = `Here:\n\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``;
    expect(extractJsonObject(raw)).toEqual(SAMPLE);
    expect(parseReviewVerdict(raw).summary).toBe(SAMPLE.summary);
  });

  it('rejects bad verdict', () => {
    expect(() => {
      parseReviewVerdict(JSON.stringify({ ...SAMPLE, verdict: 'MAYBE' }));
    }).toThrow(/verdict/);
  });

  it('rejects confidence out of range', () => {
    expect(() => {
      parseReviewVerdict(JSON.stringify({ ...SAMPLE, confidence: 1.5 }));
    }).toThrow(/confidence/);
  });
});

describe('buildReviewUserPrompt', () => {
  it('includes title, acceptance, checks, and diff', () => {
    const text = buildReviewUserPrompt({
      title: 'Add model',
      description: 'Create Recipe',
      acceptance: 'Table exists',
      diff: 'diff --git a/schema.prisma',
      checks: { typescript: true, eslint: true, tests: null },
    });
    expect(text).toContain('Add model');
    expect(text).toContain('Table exists');
    expect(text).toContain('typescript=passed');
    expect(text).toContain('tests=absent');
    expect(text).toContain('diff --git');
  });

  it('includes past lessons when provided', () => {
    const text = buildReviewUserPrompt({
      title: 'Add model',
      description: 'Create Recipe',
      acceptance: 'Table exists',
      diff: '',
      pastLessons: ['Always validate input', 'Handle null pointers'],
    });
    expect(text).toContain('Past lessons');
    expect(text).toContain('Always validate input');
    expect(text).toContain('Handle null pointers');
  });

  it('omits lessons block when pastLessons is empty', () => {
    const text = buildReviewUserPrompt({
      title: 't',
      description: 'd',
      acceptance: 'a',
      diff: '',
      pastLessons: [],
    });
    expect(text).not.toContain('Past lessons');
  });
});

describe('generateReviewVerdict', () => {
  it('returns parsed verdict on first success', async () => {
    const { provider, chat } = mockProvider([JSON.stringify(SAMPLE)]);
    const v = await generateReviewVerdict(provider, {
      title: 't',
      description: 'd',
      acceptance: 'a',
      diff: 'x',
    });
    expect(v.verdict).toBe('ACCEPTED');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('retries on parse failure then succeeds', async () => {
    const { provider, chat } = mockProvider(['not-json', JSON.stringify(SAMPLE)]);
    const v = await generateReviewVerdict(provider, {
      title: 't',
      description: 'd',
      acceptance: 'a',
      diff: 'x',
    });
    expect(v.verdict).toBe('ACCEPTED');
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
