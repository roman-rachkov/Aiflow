import { describe, expect, it } from 'vitest';

import { assertProAudit } from './access';

describe('assertProAudit', () => {
  it('allows PRO', () => {
    expect(assertProAudit({ uiMode: 'PRO' })).toBeNull();
  });

  it('forbids BASIC with 403', () => {
    const res = assertProAudit({ uiMode: 'BASIC' });
    expect(res?.status).toBe(403);
  });
});
