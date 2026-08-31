/**
 * Unit tests for review memory helpers (MVP-3 C2).
 * extractLesson is pure; storeLessonFromVerdict uses injected deps.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ReviewVerdict } from '@aiflow/ai-roles';

import { extractLesson, storeLessonFromVerdict } from './memory';

const ACCEPTED: ReviewVerdict = {
  verdict: 'ACCEPTED',
  confidence: 0.9,
  summary: 'All acceptance criteria met.',
  details: {
    acceptance_met: true,
    compilation: true,
    lint: true,
    tests: null,
    issues: [],
    suggestions: '',
  },
};

const REJECTED: ReviewVerdict = {
  verdict: 'REJECTED',
  confidence: 0.4,
  summary: 'Missing search endpoint.',
  details: {
    acceptance_met: false,
    compilation: true,
    lint: true,
    tests: null,
    issues: [
      { file: 'app/page.tsx', line: 10, severity: 'error', description: 'Route not implemented' },
    ],
    suggestions: 'Add GET /api/search',
  },
};

describe('extractLesson', () => {
  it('includes task title and summary', () => {
    const lesson = extractLesson(ACCEPTED, 'Create Recipe model');
    expect(lesson).toContain('Create Recipe model');
    expect(lesson).toContain('All acceptance criteria met.');
  });

  it('includes top error issue', () => {
    const lesson = extractLesson(REJECTED, 'Search feature');
    expect(lesson).toContain('app/page.tsx');
    expect(lesson).toContain('Route not implemented');
  });

  it('includes suggestions when present', () => {
    const lesson = extractLesson(REJECTED, 'Search feature');
    expect(lesson).toContain('Add GET /api/search');
  });

  it('omits issue/suggestion blocks when absent', () => {
    const lesson = extractLesson(ACCEPTED, 'Task');
    expect(lesson).not.toContain('Key error');
    expect(lesson).not.toContain('Suggestion:');
  });
});

describe('storeLessonFromVerdict', () => {
  it('stores a REVIEWER lesson on REJECTED verdict', async () => {
    const storeLesson = vi.fn(() =>
      Promise.resolve({
        id: 'x',
        taskId: 't',
        role: 'REVIEWER' as const,
        lesson: '',
        createdAt: new Date(),
      }),
    );
    await storeLessonFromVerdict(
      { schemaName: 'schema', taskId: 'task-1', taskTitle: 'Search feature', verdict: REJECTED },
      { storeLesson },
    );
    expect(storeLesson).toHaveBeenCalledWith(
      'schema',
      expect.objectContaining({ role: 'REVIEWER', taskId: 'task-1' }),
    );
  });

  it('stores a REVIEWER lesson on ACCEPTED verdict', async () => {
    const storeLesson = vi.fn(() =>
      Promise.resolve({
        id: 'x',
        taskId: 't',
        role: 'REVIEWER' as const,
        lesson: '',
        createdAt: new Date(),
      }),
    );
    await storeLessonFromVerdict(
      { schemaName: 'schema', taskId: 'task-1', taskTitle: 'Recipe model', verdict: ACCEPTED },
      { storeLesson },
    );
    expect(storeLesson).toHaveBeenCalledOnce();
    expect(storeLesson).toHaveBeenCalledWith(
      'schema',
      expect.objectContaining({ lesson: expect.stringContaining('Recipe model') }),
    );
  });
});
