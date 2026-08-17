import { describe, expect, it } from 'vitest';

import { parseLatestReview, REVIEW_LOG_MARKER } from './parse-review';

describe('parseLatestReview', () => {
  it('returns null when marker is absent', () => {
    expect(parseLatestReview('no review here')).toBeNull();
  });

  it('parses the latest review JSON', () => {
    const first = `${REVIEW_LOG_MARKER}\n{"verdict":"REJECTED","confidence":0.5,"summary":"old"}\n`;
    const second = `${REVIEW_LOG_MARKER}\n{"verdict":"ACCEPTED","confidence":0.9,"summary":"ok","details":{"issues":[],"suggestions":""}}\n`;
    const parsed = parseLatestReview(`${first}\n${second}`);
    expect(parsed).toEqual({
      verdict: 'ACCEPTED',
      confidence: 0.9,
      summary: 'ok',
      suggestions: '',
      issueCount: 0,
    });
  });
});
