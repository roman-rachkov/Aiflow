/**
 * Deterministic dogfood path when DOGFOOD_FIXTURE=1 (no billed LLM calls).
 * Used by live compose dogfood on CI/cloud VMs without API keys.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parsePlanTasks, type PlanTask } from './planner';
import type { ReviewVerdict } from './reviewer';

const FIXTURE_ROOT = join(import.meta.dirname, '../../../tools/dogfood-live/fixtures/todo-crud');
const FIXTURE_PLAN_PATH = join(
  import.meta.dirname,
  '../../../tools/evals/cases/todo-crud/fixture-plan.json',
);

/** True when worker/app should use fixture plan, codegen, and auto-accept review. */
export function isDogfoodFixtureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DOGFOOD_FIXTURE === '1';
}

/** Planner output for todo-crud golden case (offline eval fixture). */
export function loadFixturePlan(): PlanTask[] {
  const raw = readFileSync(FIXTURE_PLAN_PATH, 'utf8');
  return parsePlanTasks(raw);
}

/** Map planner task title → fixture directory slug under todo-crud fixtures. */
export function resolveFixtureTaskSlug(title: string): string | null {
  const map: Record<string, string> = {
    'Add Todo Prisma model': '01-prisma',
    'Todo REST API': '02-api',
    'Todo list page UI': '03-ui',
    'Smoke-test primary todo path': '04-smoke',
  };
  return map[title] ?? null;
}

/** Host path to todo-crud fixture tree (bind-mounted into sandbox). */
export function fixtureRootPath(): string {
  return FIXTURE_ROOT;
}

/** Auto-accept review verdict for fixture dogfood (sandbox checks already passed). */
export function fixtureReviewVerdict(): ReviewVerdict {
  return {
    verdict: 'ACCEPTED',
    confidence: 1,
    summary: 'DOGFOOD_FIXTURE auto-accept after sandbox gates passed.',
    details: {
      acceptance_met: true,
      compilation: true,
      lint: true,
      tests: null,
      issues: [],
      suggestions: '',
    },
  };
}
