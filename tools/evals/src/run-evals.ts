import { generatePlanTasks, parsePlanTasks, type PlanTask } from '@aiflow/ai-roles';

import { reportEvalScores } from './langfuse-report.ts';
import { loadGoldenCases } from './load-cases.ts';
import { scorePlan } from './score-plan.ts';
import { scorePromptContracts } from './score-prompts.ts';
import type { CheckResult, EvalRunResult, GoldenCase } from './types.ts';

/** Run the golden SPEC→plan→code eval suite (offline fixtures by default). */
export async function runEvals(options?: { live?: boolean }): Promise<EvalRunResult> {
  const live = options?.live === true || process.env.EVALS_LIVE === '1';
  const cases = await loadGoldenCases();
  const checks: CheckResult[] = [...(await scorePromptContracts())];
  for (const golden of cases) {
    const tasks = await resolvePlan(golden, live);
    checks.push(...scorePlan(golden.id, tasks, golden.expectations));
  }
  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.length - passed;
  const langfuseReported = await maybeReport(checks);
  return { checks, passed, failed, mode: live ? 'live' : 'offline', langfuseReported };
}

async function resolvePlan(golden: GoldenCase, live: boolean): Promise<PlanTask[]> {
  if (!live) {
    return parsePlanTasks(golden.fixturePlan);
  }
  // Dynamic import keeps the offline CLI path free of env-provider ESM quirks
  // under Node's native loader when tsx resolves workspace packages.
  const { createProviderFromEnv } = await import('@aiflow/ai-roles');
  return generatePlanTasks(createProviderFromEnv(), golden.spec);
}

async function maybeReport(checks: CheckResult[]): Promise<boolean> {
  try {
    return await reportEvalScores(checks);
  } catch {
    /* Langfuse optional — never fail the gate on report transport */
    return false;
  }
}
