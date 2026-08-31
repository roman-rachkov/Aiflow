/**
 * Smoke check for Planner Tree-of-Thoughts flag (MVP-3 C4).
 * Offline-safe: validates the scoring heuristic against a well-formed fixture task.
 * Note: live ToT evaluation requires EVALS_LIVE=1 and PLANNER_TOT_ENABLED=true.
 */

import { scorePlanCandidate } from '@aiflow/ai-roles';
import type { PlanTask } from '@aiflow/ai-roles';

import type { CheckResult } from './types.ts';

const FIXTURE_TASK: PlanTask = {
  title: 'Create User model',
  description: 'Add User model to schema.prisma with email and name.',
  status: 'PENDING',
  priority: 'medium',
  effort: 'M',
  dependencies: [],
  acceptance: 'Migration applies; User table exists in the database.',
  needsConfirmation: false,
};

/** Smoke: heuristic gives max score (3) for a well-formed plan. */
export function scoreToTSmoke(): CheckResult {
  const score = scorePlanCandidate([FIXTURE_TASK]);
  return {
    name: 'tot:heuristic-smoke',
    ok: score === 3,
    detail: score === 3 ? undefined : `expected score 3, got ${String(score)}`,
  };
}
