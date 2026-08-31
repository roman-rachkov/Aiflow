import { describe, expect, it } from 'vitest';

import { generatePlanTasksWithToT, scorePlanCandidate } from './planner-tot';
import type { PlanTask } from './planner';
import type { ModelProvider } from './types';

const SAMPLE: PlanTask = {
  title: 'Create User model',
  description: 'Add User model to schema.prisma.',
  status: 'PENDING',
  priority: 'critical',
  effort: 'M',
  dependencies: [],
  acceptance: 'Migration applies; User table exists.',
  needsConfirmation: false,
};

function mockProvider(responses: string[]): ModelProvider {
  let i = 0;
  return {
    chat(): AsyncIterable<string> {
      const text = responses[Math.min(i, responses.length - 1)] ?? '';
      i += 1;
      return {
        [Symbol.asyncIterator](): AsyncIterator<string> {
          let yielded = false;
          return {
            next(): Promise<IteratorResult<string>> {
              if (yielded) return Promise.resolve({ value: undefined, done: true });
              yielded = true;
              return Promise.resolve({ value: text, done: false });
            },
          };
        },
      };
    },
  };
}

describe('scorePlanCandidate', () => {
  it('scores 3 for a perfect plan', () => {
    expect(scorePlanCandidate([SAMPLE])).toBe(3);
  });

  it('scores 3 when deps reference valid titles', () => {
    const a: PlanTask = { ...SAMPLE, title: 'A', dependencies: [] };
    const b: PlanTask = { ...SAMPLE, title: 'B', dependencies: ['A'] };
    expect(scorePlanCandidate([a, b])).toBe(3);
  });

  it('scores 2 when a dep title is missing', () => {
    const bad: PlanTask = { ...SAMPLE, dependencies: ['NonExistent'] };
    expect(scorePlanCandidate([bad])).toBe(2);
  });

  it('scores 2 when an acceptance is empty', () => {
    const bad: PlanTask = { ...SAMPLE, acceptance: '' };
    expect(scorePlanCandidate([bad])).toBe(2);
  });

  it('scores 0 for an empty array', () => {
    expect(scorePlanCandidate([])).toBe(0);
  });
});

describe('generatePlanTasksWithToT — baseline', () => {
  const sampleJson = JSON.stringify([SAMPLE]);

  it('falls back to standard mode when totMode=false', async () => {
    const provider = mockProvider([sampleJson]);
    const tasks = await generatePlanTasksWithToT(provider, '# Spec', { totMode: false });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe(SAMPLE.title);
  });
});

describe('generatePlanTasksWithToT — ToT mode', () => {
  const sampleJson = JSON.stringify([SAMPLE]);

  it('generates candidates and picks best in ToT mode', async () => {
    const badDep: PlanTask = { ...SAMPLE, title: 'X', dependencies: ['ghost'] };
    const provider = mockProvider([JSON.stringify([badDep]), sampleJson, sampleJson]);
    const tasks = await generatePlanTasksWithToT(provider, '# Spec', { totMode: true });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dependencies).toHaveLength(0);
  });

  it('respects candidates option', async () => {
    let callCount = 0;
    const countingProvider: ModelProvider = {
      chat(): AsyncIterable<string> {
        callCount += 1;
        const text = sampleJson;
        return {
          [Symbol.asyncIterator](): AsyncIterator<string> {
            let yielded = false;
            return {
              next(): Promise<IteratorResult<string>> {
                if (yielded) return Promise.resolve({ value: undefined, done: true });
                yielded = true;
                return Promise.resolve({ value: text, done: false });
              },
            };
          },
        };
      },
    };
    await generatePlanTasksWithToT(countingProvider, '# Spec', {
      totMode: true,
      candidates: 2,
    });
    expect(callCount).toBe(2);
  });

  it('throws when all candidates fail to parse', async () => {
    const provider = mockProvider(['not json', 'also bad', 'nope']);
    await expect(generatePlanTasksWithToT(provider, '# Spec', { totMode: true })).rejects.toThrow(
      /all candidates failed/,
    );
  });
});
