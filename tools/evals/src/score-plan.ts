import type { PlanTask } from '@aiflow/ai-roles';

import type { CheckResult, PlanExpectations } from './types.ts';

/** Score a parsed plan against golden expectations. */
export function scorePlan(
  caseId: string,
  tasks: PlanTask[],
  expectations: PlanExpectations,
): CheckResult[] {
  const checks: CheckResult[] = [
    checkCount(caseId, tasks.length, expectations.minTasks, expectations.maxTasks),
    ...expectations.mustIncludeTitleSubstrings.map((needle) =>
      checkTitleIncludes(caseId, tasks, needle),
    ),
    ...expectations.mustNotIncludeSubstrings.map((needle) =>
      checkNoForbidden(caseId, tasks, needle),
    ),
    ...expectations.requiredMentions.map((needle) => checkMention(caseId, tasks, needle)),
  ];
  if (expectations.requireSmokeTest) {
    checks.push(checkSmokeTest(caseId, tasks));
  }
  return checks;
}

function checkCount(caseId: string, n: number, min: number, max: number): CheckResult {
  const ok = n >= min && n <= max;
  return {
    name: `${caseId}:task-count`,
    ok,
    detail: ok ? `${String(n)} tasks` : `got ${String(n)}, want ${String(min)}–${String(max)}`,
  };
}

function checkTitleIncludes(caseId: string, tasks: PlanTask[], needle: string): CheckResult {
  const ok = tasks.some((t) => t.title.toLowerCase().includes(needle.toLowerCase()));
  return {
    name: `${caseId}:title-includes:${needle}`,
    ok,
    detail: ok ? undefined : `no title contains "${needle}"`,
  };
}

function checkNoForbidden(caseId: string, tasks: PlanTask[], needle: string): CheckResult {
  const hay = tasks
    .map((t) => `${t.title}\n${t.description}`)
    .join('\n')
    .toLowerCase();
  const ok = !hay.includes(needle.toLowerCase());
  return {
    name: `${caseId}:forbidden:${needle}`,
    ok,
    detail: ok ? undefined : `plan mentions forbidden "${needle}"`,
  };
}

function checkMention(caseId: string, tasks: PlanTask[], needle: string): CheckResult {
  const hay = tasks.map((t) => `${t.title}\n${t.description}\n${t.acceptance}`).join('\n');
  const ok = hay.toLowerCase().includes(needle.toLowerCase());
  return {
    name: `${caseId}:mention:${needle}`,
    ok,
    detail: ok ? undefined : `plan never mentions "${needle}"`,
  };
}

function checkSmokeTest(caseId: string, tasks: PlanTask[]): CheckResult {
  const last = tasks[tasks.length - 1];
  const text = last ? `${last.title}\n${last.acceptance}`.toLowerCase() : '';
  const ok = /smoke|e2e|end-to-end|primary (user )?path/.test(text);
  return {
    name: `${caseId}:smoke-test`,
    ok,
    detail: ok ? undefined : 'last task is not a smoke/e2e check',
  };
}
