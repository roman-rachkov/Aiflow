import { describe, expect, it } from 'vitest';

import {
  AUTO_APPROVE_THRESHOLD,
  isAutoApproved,
  parseLatestReview,
  REVIEW_LOG_MARKER,
} from './parse-review';

describe('parseLatestReview — basic', () => {
  it('returns null when marker is absent', () => {
    expect(parseLatestReview('no review here')).toBeNull();
  });

  it('parses the latest review JSON (last marker wins)', () => {
    const first = `${REVIEW_LOG_MARKER}\n{"verdict":"REJECTED","confidence":0.5,"summary":"old"}\n`;
    const second = `${REVIEW_LOG_MARKER}\n{"verdict":"ACCEPTED","confidence":0.9,"summary":"ok","details":{"issues":[],"suggestions":""}}\n`;
    const parsed = parseLatestReview(`${first}\n${second}`);
    expect(parsed).toEqual({
      verdict: 'ACCEPTED',
      confidence: 0.9,
      summary: 'ok',
      suggestions: '',
      issueCount: 0,
      issues: [],
    });
  });

  it('handles missing details gracefully', () => {
    const json = JSON.stringify({ verdict: 'ACCEPTED', confidence: 0.7, summary: 'fine' });
    const parsed = parseLatestReview(`${REVIEW_LOG_MARKER}\n${json}`);
    expect(parsed?.issues).toEqual([]);
    expect(parsed?.issueCount).toBe(0);
    expect(parsed?.suggestions).toBeUndefined();
  });
});

describe('parseLatestReview — issues', () => {
  it('parses issues with file, line, severity, description', () => {
    const issue = { file: 'src/foo.ts', line: 42, severity: 'error', description: 'null ref' };
    const json = JSON.stringify({
      verdict: 'REJECTED',
      confidence: 0.6,
      summary: 'has errors',
      details: { issues: [issue], suggestions: '' },
    });
    const parsed = parseLatestReview(`${REVIEW_LOG_MARKER}\n${json}`);
    expect(parsed?.issues).toHaveLength(1);
    expect(parsed?.issues[0]).toEqual({
      file: 'src/foo.ts',
      line: 42,
      severity: 'error',
      description: 'null ref',
    });
    expect(parsed?.issueCount).toBe(1);
  });

  it('defaults unknown severity to "info"', () => {
    const issue = { file: 'a.ts', line: 1, severity: 'critical', description: 'x' };
    const json = JSON.stringify({
      verdict: 'REJECTED',
      confidence: 0.4,
      summary: 's',
      details: { issues: [issue], suggestions: '' },
    });
    const parsed = parseLatestReview(`${REVIEW_LOG_MARKER}\n${json}`);
    expect(parsed?.issues[0]?.severity).toBe('info');
  });

  it('skips malformed issue entries', () => {
    const json = JSON.stringify({
      verdict: 'ACCEPTED',
      confidence: 0.8,
      summary: 'ok',
      details: {
        issues: [null, { file: 'x.ts', description: 'y', severity: 'warning' }],
        suggestions: '',
      },
    });
    const parsed = parseLatestReview(`${REVIEW_LOG_MARKER}\n${json}`);
    expect(parsed?.issueCount).toBe(1);
  });
});

describe('isAutoApproved', () => {
  const threshold = AUTO_APPROVE_THRESHOLD;

  it('returns true when ACCEPTED and confidence meets threshold', () => {
    const verdict = {
      verdict: 'ACCEPTED' as const,
      confidence: threshold,
      summary: 'ok',
      issueCount: 0,
      issues: [],
    };
    expect(isAutoApproved(verdict)).toBe(true);
  });

  it('returns false when ACCEPTED but confidence below threshold', () => {
    const verdict = {
      verdict: 'ACCEPTED' as const,
      confidence: threshold - 0.01,
      summary: 'ok',
      issueCount: 0,
      issues: [],
    };
    expect(isAutoApproved(verdict)).toBe(false);
  });

  it('returns false when REJECTED even with high confidence', () => {
    const verdict = {
      verdict: 'REJECTED' as const,
      confidence: 0.99,
      summary: 'still bad',
      issueCount: 1,
      issues: [],
    };
    expect(isAutoApproved(verdict)).toBe(false);
  });
});
