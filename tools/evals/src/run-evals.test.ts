import { describe, expect, it } from 'vitest';

import { runEvals } from './run-evals.ts';

describe('runEvals', () => {
  it('passes the offline golden suite without Langfuse keys', async () => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.EVALS_LIVE;
    const result = await runEvals({ live: false });
    expect(result.mode).toBe('offline');
    expect(result.langfuseReported).toBe(false);
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThan(10);
  });
});
