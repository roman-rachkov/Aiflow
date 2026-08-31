#!/usr/bin/env tsx
/**
 * Live compose dogfood: todo-crud SPEC → plan → code:execute (MVP1-R01/R05, MVP2-51 wiring).
 * Requires running stack + worker + LLM keys + sandbox image.
 *
 *   DOGFOOD_LIVE=1 yarn workspace @aiflow/web dogfood-live
 *   # or: bash tools/dogfood-live/run.sh
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getPublicClient } from '@aiflow/db';

import { createProject } from '@/features/projects';
import { approveSpecification, createSpecificationVersion } from '@/features/specifications';
import { enqueuePlan, enqueueRunPlan, listTasks, resolveCodeContext } from '@/features/tasks';

import {
  appendDogfoodEvidence,
  pollUntil,
  taskOutcome,
  type StepResult,
} from './dogfood-live-helpers';

const ROOT = join(import.meta.dirname, '../../..');
const SPEC_PATH = join(ROOT, 'tools/evals/cases/todo-crud/spec.md');
const PLAN_TIMEOUT_MS = 10 * 60 * 1000;
const CODE_TIMEOUT_MS = 45 * 60 * 1000;
const POLL_MS = 5000;
const DEV_EMAIL = 'dev@example.com';

function assertLiveGate(): void {
  if (process.env.DOGFOOD_LIVE !== '1') {
    throw new Error('Set DOGFOOD_LIVE=1 to run live dogfood (needs compose + LLM + sandbox)');
  }
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
    throw new Error('DATABASE_URL and REDIS_URL required (run inside compose app container)');
  }
}

async function resolveDevUserId(): Promise<string> {
  const user = await getPublicClient().user.findFirst({
    where: { email: DEV_EMAIL, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new Error(`Dev user ${DEV_EMAIL} missing — run seed:dev-user first`);
  return user.id;
}

async function main(): Promise<void> {
  assertLiveGate();
  const steps: StepResult[] = [];
  const ownerId = await resolveDevUserId();
  const specMarkdown = readFileSync(SPEC_PATH, 'utf8');

  const project = await createProject({
    name: `Dogfood Todo ${new Date().toISOString().slice(0, 10)}`,
    description: 'Automated live dogfood run',
    ownerId,
  });
  steps.push({ name: 'Create project', ok: true, detail: project.id });

  const meta = await getPublicClient().projectMeta.findUniqueOrThrow({
    where: { id: project.id },
    select: { schemaName: true },
  });

  const spec = await createSpecificationVersion(meta.schemaName, specMarkdown);
  await approveSpecification(meta.schemaName, spec.version, ownerId);
  steps.push({ name: 'Approve SPEC', ok: true, detail: `v${String(spec.version)}` });

  await enqueuePlan(project.id, meta.schemaName);
  steps.push({ name: 'Enqueue plan', ok: true });

  await pollUntil('plan tasks', PLAN_TIMEOUT_MS, POLL_MS, async () => {
    return (await listTasks(meta.schemaName)).length > 0;
  });
  const afterPlan = await listTasks(meta.schemaName);
  steps.push({
    name: 'Plan generation',
    ok: afterPlan.length > 0,
    detail: `${String(afterPlan.length)} tasks`,
  });

  const ctx = await resolveCodeContext(project.id, ownerId);
  if (!ctx) throw new Error('Code context missing');
  const run = await enqueueRunPlan(ctx);
  steps.push({
    name: 'Enqueue code',
    ok: run.taskIds.length > 0,
    detail: `${String(run.taskIds.length)} jobs`,
  });

  await pollUntil('code execution', CODE_TIMEOUT_MS, POLL_MS, async () => {
    return taskOutcome(await listTasks(meta.schemaName)).ok;
  });
  const codeOutcome = taskOutcome(await listTasks(meta.schemaName));
  steps.push({ name: 'Code execution', ok: codeOutcome.ok, detail: codeOutcome.detail });

  const allOk = steps.every((s) => s.ok);
  const r01 = allOk ? 'PASS' : 'FAIL';
  const overall = `\`R01: ${r01}\` — live Planner→Coder on todo-crud SPEC.
\`R05: ${r01}\` — narrow dogfood plan→codegen.
\`MVP2-51: ${allOk ? 'PARTIAL' : 'FAIL'}\` — todo-crud cycle; ai-studio self-build manual.`;

  appendDogfoodEvidence(ROOT, steps, project.id, overall);
  process.stdout.write(`${overall}\n`);
  if (!allOk) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    process.stderr.write(
      `dogfood-live error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => void getPublicClient().$disconnect());
