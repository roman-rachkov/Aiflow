/**
 * Automated slim MVP-1 path smoke (no live Docker/LLM).
 * Proves handler wiring: plan payload → code claim → review retry helpers → deploy URL builder.
 * Output feeds specs/slim-mvp1-dogfood/EVIDENCE.md via `yarn dogfood-smoke`.
 */

import { describe, expect, it } from 'vitest';

import { validatePlanPayload } from '../../../apps/worker/src/plan/handler';
import { resolveDeployClaim } from '../../../apps/worker/src/deploy/claim';
import { buildDeployUrl } from '../../../apps/worker/src/deploy/run-container';
import { nextRetryCount } from '../../../apps/worker/src/review/retry';
import { parsePlanTasks } from '../../../packages/ai-roles/src/planner';

const SAMPLE_PLAN = `[
  {
    "title": "Add Todo model",
    "description": "Prisma Todo with title and done flag",
    "priority": "high",
    "effort": "S",
    "dependencies": [],
    "acceptance": "Todo CRUD API returns 200",
    "needsConfirmation": false
  }
]`;

describe('slim MVP-1 automated dogfood gate', () => {
  it('validates plan payload shape', () => {
    expect(() => {
      validatePlanPayload({
        projectId: 'p1',
        schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        specificationId: 'spec-1',
        specificationVersion: 1,
      });
    }).not.toThrow();
  });

  it('parses planner JSON for a minimal CRUD task', () => {
    const tasks = parsePlanTasks(SAMPLE_PLAN);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain('Todo');
  });

  it('deploy claim allows BUILDING → pipeline', () => {
    const claim = resolveDeployClaim({
      id: 'd1',
      status: 'BUILDING',
      imageTag: null,
      url: null,
    });
    expect(claim.kind).toBe('run');
  });

  it('builds Traefik deploy URL for deployment id', () => {
    const url = buildDeployUrl('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(url).toMatch(/^http:\/\/app-[a-f0-9]+\./);
  });

  it('review Self-Refine stays within retry cap', () => {
    expect(nextRetryCount(0)).toBe(1);
    expect(nextRetryCount(2)).toBe(3);
    expect(nextRetryCount(3)).toBeNull();
  });
});
