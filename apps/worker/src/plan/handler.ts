/**
 * BullMQ handler for `plan:generate` — load approved SPEC, call Planner LLM,
 * persist Task + TaskDependency rows (Task 3.2).
 */

import type { Job } from 'bullmq';
import {
  createProviderFromEnv,
  generatePlanTasksWithToT,
  runWithTraceContext,
  type PlanTask,
} from '@aiflow/ai-roles';
import { getProjectClient } from '@aiflow/db';
import type { PlanGeneratePayload } from '@aiflow/queue';

import { persistPlanTasks, type PersistPlanResult } from './persist';

export type PlanHandlerDeps = {
  loadSpecification: (
    schemaName: string,
    specificationId: string,
  ) => Promise<{ id: string; content: string; approvedAt: Date | null } | null>;
  generatePlan: (specMarkdown: string) => Promise<PlanTask[]>;
  persistPlan: (input: {
    schemaName: string;
    specificationId: string;
    plan: PlanTask[];
  }) => Promise<PersistPlanResult>;
};

const defaultDeps: PlanHandlerDeps = {
  loadSpecification: loadApprovedSpecification,
  generatePlan: (spec) => generatePlanTasksWithToT(createProviderFromEnv(), spec),
  persistPlan: persistPlanTasks,
};

/** Validate payload fields; throws on missing/empty values. */
export function validatePlanPayload(data: PlanGeneratePayload): void {
  const strings: (keyof PlanGeneratePayload)[] = ['projectId', 'schemaName', 'specificationId'];
  for (const key of strings) {
    if (!data[key] || typeof data[key] !== 'string') {
      throw new Error(`Invalid plan payload: missing ${key}`);
    }
  }
  if (typeof data.specificationVersion !== 'number' || data.specificationVersion < 1) {
    throw new Error('Invalid plan payload: specificationVersion');
  }
}

/** Process one plan:generate job. Exported for unit tests with mocked deps. */
export async function handlePlanGenerate(
  job: Job<PlanGeneratePayload>,
  deps: PlanHandlerDeps = defaultDeps,
): Promise<PersistPlanResult> {
  const payload = job.data;
  validatePlanPayload(payload);

  const spec = await deps.loadSpecification(payload.schemaName, payload.specificationId);
  if (!spec) {
    throw new Error(`Specification not found: ${payload.specificationId}`);
  }
  if (!spec.approvedAt) {
    throw new Error(`Specification not approved: ${payload.specificationId}`);
  }

  const plan = await runWithTraceContext(
    { role: 'planner', projectId: payload.projectId, tags: ['plan-generate'] },
    () => deps.generatePlan(spec.content),
  );
  return deps.persistPlan({
    schemaName: payload.schemaName,
    specificationId: spec.id,
    plan,
  });
}

async function loadApprovedSpecification(
  schemaName: string,
  specificationId: string,
): Promise<{ id: string; content: string; approvedAt: Date | null } | null> {
  const row = await getProjectClient(schemaName).specification.findFirst({
    where: { id: specificationId, deletedAt: null },
    select: { id: true, content: true, approvedAt: true },
  });
  return row;
}
