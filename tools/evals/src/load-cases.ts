import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CASES_DIR } from './paths.ts';
import type { GoldenCase, PlanExpectations } from './types.ts';

/** Load every subdirectory under cases/ as a golden SPEC→plan fixture. */
export async function loadGoldenCases(): Promise<GoldenCase[]> {
  const entries = await readdir(CASES_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  dirs.sort();
  const cases: GoldenCase[] = [];
  for (const id of dirs) {
    cases.push(await loadOneCase(id));
  }
  if (cases.length === 0) {
    throw new Error(`No golden cases under ${CASES_DIR}`);
  }
  return cases;
}

async function loadOneCase(id: string): Promise<GoldenCase> {
  const dir = join(CASES_DIR, id);
  const [spec, expectationsRaw, fixturePlan] = await Promise.all([
    readFile(join(dir, 'spec.md'), 'utf8'),
    readFile(join(dir, 'expectations.json'), 'utf8'),
    readFile(join(dir, 'fixture-plan.json'), 'utf8'),
  ]);
  return {
    id,
    spec,
    expectations: parseExpectations(JSON.parse(expectationsRaw) as unknown),
    fixturePlan,
  };
}

function parseExpectations(raw: unknown): PlanExpectations {
  if (!raw || typeof raw !== 'object') {
    throw new Error('expectations.json must be an object');
  }
  const row = raw as Record<string, unknown>;
  return {
    minTasks: requireNumber(row.minTasks, 'minTasks'),
    maxTasks: requireNumber(row.maxTasks, 'maxTasks'),
    mustIncludeTitleSubstrings: requireStringArray(
      row.mustIncludeTitleSubstrings,
      'mustIncludeTitleSubstrings',
    ),
    mustNotIncludeSubstrings: requireStringArray(
      row.mustNotIncludeSubstrings,
      'mustNotIncludeSubstrings',
    ),
    requireSmokeTest: Boolean(row.requireSmokeTest),
    requiredMentions: requireStringArray(row.requiredMentions, 'requiredMentions'),
  };
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`expectations.${field} must be a number`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`expectations.${field} must be a string[]`);
  }
  return value as string[];
}
