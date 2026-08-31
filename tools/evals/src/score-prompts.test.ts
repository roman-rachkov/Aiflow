import { describe, expect, it } from 'vitest';

import { scorePromptContracts } from './score-prompts.ts';

describe('scorePromptContracts', () => {
  it('passes current Planner/Reviewer/Coder prompt surfaces', async () => {
    const checks = await scorePromptContracts();
    const failed = checks.filter((c) => !c.ok);
    expect(failed, failed.map((c) => `${c.name}: ${c.detail ?? ''}`).join('\n')).toEqual([]);
  });
});
