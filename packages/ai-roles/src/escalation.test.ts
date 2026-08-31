import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { callPlannerAdvisor } from './escalation';

describe('callPlannerAdvisor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.PLANNER_ADVISOR_MODEL;
    delete process.env.AI_ROUTER_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when PLANNER_ADVISOR_MODEL is unset', async () => {
    await expect(callPlannerAdvisor('# Spec')).rejects.toThrow(/PLANNER_ADVISOR_MODEL/);
  });

  it('returns advisor content on success', async () => {
    process.env.PLANNER_ADVISOR_MODEL = 'gpt-4-advisor';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '[{"title":"T","description":"D","acceptance":"A"}]' } }],
        }),
    });

    const text = await callPlannerAdvisor('# Spec', { routerUrl: 'http://router:3001' });
    expect(text).toContain('"title":"T"');
    expect(fetch).toHaveBeenCalledWith(
      'http://router:3001/v1/escalate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when escalate HTTP fails', async () => {
    process.env.PLANNER_ADVISOR_MODEL = 'gpt-4-advisor';
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 502 });

    await expect(callPlannerAdvisor('# Spec')).rejects.toThrow(/HTTP 502/);
  });
});
