import { describe, expect, it } from 'vitest';

import { parsePlanTasks } from '@aiflow/ai-roles';

import { scorePlan } from './score-plan.ts';
import type { PlanExpectations } from './types.ts';

const EXPECTATIONS: PlanExpectations = {
  minTasks: 2,
  maxTasks: 5,
  mustIncludeTitleSubstrings: ['Todo'],
  mustNotIncludeSubstrings: ['Stripe'],
  requireSmokeTest: true,
  requiredMentions: ['Prisma'],
};

const FIXTURE = `[
  {
    "title": "Add Todo model",
    "description": "Prisma Todo model",
    "status": "PENDING",
    "priority": "critical",
    "effort": "M",
    "dependencies": [],
    "acceptance": "Table exists",
    "needsConfirmation": false
  },
  {
    "title": "Smoke-test todo path",
    "description": "Primary path smoke",
    "status": "PENDING",
    "priority": "medium",
    "effort": "S",
    "dependencies": ["Add Todo model"],
    "acceptance": "Smoke covers primary path",
    "needsConfirmation": false
  }
]`;

describe('scorePlan', () => {
  it('passes a well-formed fixture plan', () => {
    const tasks = parsePlanTasks(FIXTURE);
    const checks = scorePlan('sample', tasks, EXPECTATIONS);
    expect(checks.every((c) => c.ok)).toBe(true);
  });

  it('fails when a forbidden substring appears', () => {
    const tasks = parsePlanTasks(FIXTURE);
    tasks[0].description = 'Add Stripe checkout later';
    const checks = scorePlan('sample', tasks, EXPECTATIONS);
    const forbidden = checks.find((c) => c.name.includes('forbidden:Stripe'));
    expect(forbidden?.ok).toBe(false);
  });
});
