import { describe, expect, it } from 'vitest';

import { scoreRedTeam } from './score-redteam.ts';

describe('scoreRedTeam', () => {
  it('blocks mutating tools for every injection case', () => {
    const checks = scoreRedTeam();
    const failed = checks.filter((c) => !c.ok);
    expect(failed, failed.map((c) => `${c.name}: ${c.detail ?? ''}`).join('\n')).toEqual([]);
  });
});
