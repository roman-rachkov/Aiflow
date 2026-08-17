import { describe, expect, it } from 'vitest';

import { QUEUE_CODE_REVIEW } from './names';
import { REVIEW_JOB_OPTIONS, validateReviewPayload, type CodeReviewPayload } from './review';

const PAYLOAD: CodeReviewPayload = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  taskId: 'task-1',
  branchName: 'task/task-1-add-model',
  diff: 'diff --git a/x b/x\n',
};

describe('validateReviewPayload', () => {
  it('accepts a complete payload', () => {
    expect(() => {
      validateReviewPayload(PAYLOAD);
    }).not.toThrow();
  });

  it('allows empty diff', () => {
    expect(() => {
      validateReviewPayload({ ...PAYLOAD, diff: '' });
    }).not.toThrow();
  });

  it('rejects missing taskId', () => {
    expect(() => {
      validateReviewPayload({ ...PAYLOAD, taskId: '' });
    }).toThrow(/taskId/);
  });
});

describe('review queue constants', () => {
  it('exports hyphen queue name and retry options', () => {
    expect(QUEUE_CODE_REVIEW).toBe('code-review');
    expect(REVIEW_JOB_OPTIONS.attempts).toBe(2);
  });
});
