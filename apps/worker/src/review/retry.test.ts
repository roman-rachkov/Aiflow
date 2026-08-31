import { describe, expect, it } from 'vitest';
import type { ReviewVerdict } from '@aiflow/ai-roles';

import {
  buildRetryPayload,
  buildReviewFeedback,
  MAX_REVIEW_RETRIES,
  nextRetryCount,
} from './retry';

const GITEA = {
  giteaOwner: 'aistudio',
  giteaRepo: 'demo',
  giteaDefaultBranch: 'main',
};

const VERDICT: ReviewVerdict = {
  verdict: 'REJECTED',
  confidence: 0.4,
  summary: 'Missing search endpoint',
  details: {
    acceptance_met: false,
    compilation: true,
    lint: true,
    tests: null,
    issues: [{ file: 'app/page.tsx', line: 12, severity: 'error', description: 'Not implemented' }],
    suggestions: 'Add GET /api/search route',
  },
};

const REVIEW_PAYLOAD = {
  projectId: 'proj-1',
  schemaName: 'project_aaa',
  taskId: 'task-1',
  branchName: 'task/task-1-add',
  diff: '+hello\n',
};

describe('nextRetryCount', () => {
  it('returns 1 when no prior retries', () => {
    expect(nextRetryCount(undefined)).toBe(1);
  });

  it('increments up to MAX_REVIEW_RETRIES', () => {
    expect(nextRetryCount(0)).toBe(1);
    expect(nextRetryCount(1)).toBe(2);
    expect(nextRetryCount(MAX_REVIEW_RETRIES - 1)).toBe(MAX_REVIEW_RETRIES);
  });

  it('returns null when cap is reached', () => {
    expect(nextRetryCount(MAX_REVIEW_RETRIES)).toBeNull();
    expect(nextRetryCount(MAX_REVIEW_RETRIES + 1)).toBeNull();
  });
});

describe('buildReviewFeedback', () => {
  it('includes the summary', () => {
    const text = buildReviewFeedback(VERDICT);
    expect(text).toContain('Missing search endpoint');
  });

  it('lists issues with severity and location', () => {
    const text = buildReviewFeedback(VERDICT);
    expect(text).toContain('app/page.tsx');
    expect(text).toContain('error');
    expect(text).toContain('Not implemented');
    expect(text).toContain('12');
  });

  it('includes suggestions', () => {
    const text = buildReviewFeedback(VERDICT);
    expect(text).toContain('Add GET /api/search route');
  });

  it('omits issues block when none', () => {
    const v: ReviewVerdict = {
      ...VERDICT,
      details: { ...VERDICT.details, issues: [], suggestions: '' },
    };
    const text = buildReviewFeedback(v);
    expect(text).not.toContain('Issues:');
    expect(text).not.toContain('Suggestions:');
  });
});

describe('buildRetryPayload', () => {
  it('builds a valid CodeExecutePayload', () => {
    const result = buildRetryPayload(REVIEW_PAYLOAD, GITEA, VERDICT, 1);
    expect(result.projectId).toBe('proj-1');
    expect(result.schemaName).toBe('project_aaa');
    expect(result.taskId).toBe('task-1');
    expect(result.giteaOwner).toBe('aistudio');
    expect(result.retryCount).toBe(1);
    expect(result.dryRun).toBe(false);
    expect(result.reviewFeedback).toContain('Missing search endpoint');
  });

  it('preserves branchName from review payload', () => {
    const result = buildRetryPayload(REVIEW_PAYLOAD, GITEA, VERDICT, 2);
    expect(result.branchName).toBe('task/task-1-add');
  });
});
