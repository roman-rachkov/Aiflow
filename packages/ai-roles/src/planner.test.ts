import { describe, expect, it, vi } from 'vitest';

import { extractJsonArray, generatePlanTasks, parsePlanTasks, type PlanTask } from './planner';
import type { ModelProvider } from './types';

const SAMPLE: PlanTask = {
  title: 'Create User model',
  description: 'Add User to schema.prisma with email and name.',
  status: 'PENDING',
  priority: 'critical',
  effort: 'M',
  dependencies: [],
  acceptance: 'Migration applies; User table exists.',
  needsConfirmation: false,
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

describe('parsePlanTasks', () => {
  it('parses a raw JSON array', () => {
    const tasks = parsePlanTasks(JSON.stringify([SAMPLE]));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe(SAMPLE.title);
    expect(tasks[0].priority).toBe('critical');
  });

  it('accepts fenced JSON', () => {
    const raw = `Here:\n\`\`\`json\n${JSON.stringify([SAMPLE])}\n\`\`\``;
    expect(extractJsonArray(raw)).toEqual([SAMPLE]);
    expect(parsePlanTasks(raw)[0].title).toBe(SAMPLE.title);
  });

  it('rejects empty array', () => {
    expect(() => {
      parsePlanTasks('[]');
    }).toThrow(/empty/);
  });

  it('rejects bad priority', () => {
    const bad = [{ ...SAMPLE, priority: 'urgent' }];
    expect(() => {
      parsePlanTasks(JSON.stringify(bad));
    }).toThrow(/priority/);
  });

  it('defaults missing effort to M', () => {
    const { effort: _drop, ...withoutEffort } = SAMPLE;
    void _drop;
    const tasks = parsePlanTasks(JSON.stringify([withoutEffort]));
    expect(tasks[0].effort).toBe('M');
  });

  it('rejects oversized arrays', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...SAMPLE,
      title: `Task ${String(i)}`,
    }));
    expect(() => {
      parsePlanTasks(JSON.stringify(many));
    }).toThrow(/max is 24/);
  });
});

describe('generatePlanTasks', () => {
  it('returns tasks on first good response', async () => {
    const { provider, chat } = mockProvider([JSON.stringify([SAMPLE])]);
    const tasks = await generatePlanTasks(provider, '# Spec');
    expect(tasks).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('retries on parse failure then succeeds', async () => {
    const { provider, chat } = mockProvider(['not json', JSON.stringify([SAMPLE])]);
    const tasks = await generatePlanTasks(provider, '# Spec', { maxRetries: 2 });
    expect(tasks[0].title).toBe(SAMPLE.title);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const { provider, chat } = mockProvider(['nope', 'still bad', 'also bad']);
    await expect(generatePlanTasks(provider, '# Spec', { maxRetries: 2 })).rejects.toThrow();
    expect(chat).toHaveBeenCalledTimes(3);
  });
});
