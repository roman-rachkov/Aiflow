/**
 * Task list + plan:generate enqueue. Next.js is producer-only.
 */

import { getProjectClient } from '@aiflow/db';
import { getPlanQueue, type PlanGeneratePayload } from '@aiflow/queue';

import {
  PlanSpecRequiredError,
  type EnqueuePlanResult,
  type TaskPriority,
  type TaskStatus,
  type TaskSummary,
} from './types';

export type EnqueuePlanOptions = {
  /** Prefer this approved version; default = latest approved. */
  version?: number;
};

/** List non-deleted tasks for a project schema, sortOrder ascending. */
export async function listTasks(schemaName: string): Promise<TaskSummary[]> {
  const rows = await getProjectClient(schemaName).task.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      sortOrder: true,
      specificationId: true,
      createdAt: true,
      dependsOn: {
        select: { prerequisite: { select: { title: true, deletedAt: true } } },
      },
    },
  });
  return rows.map(toSummary);
}

/**
 * Resolve an approved Specification and enqueue `plan:generate`.
 * Throws PlanSpecRequiredError when none matches.
 */
export async function enqueuePlan(
  projectId: string,
  schemaName: string,
  options: EnqueuePlanOptions = {},
): Promise<EnqueuePlanResult> {
  const spec = await findApprovedSpec(schemaName, options.version);
  if (!spec) throw new PlanSpecRequiredError();

  const payload: PlanGeneratePayload = {
    projectId,
    schemaName,
    specificationId: spec.id,
    specificationVersion: spec.version,
  };
  const jobId = `plan-${spec.id}-${String(Date.now())}`;
  await getPlanQueue().add('plan:generate', payload, { jobId });
  return {
    jobId,
    specificationId: spec.id,
    specificationVersion: spec.version,
  };
}

async function findApprovedSpec(
  schemaName: string,
  version: number | undefined,
): Promise<{ id: string; version: number } | null> {
  const client = getProjectClient(schemaName);
  if (version != null) {
    return client.specification.findFirst({
      where: { version, deletedAt: null, approvedAt: { not: null } },
      select: { id: true, version: true },
    });
  }
  return client.specification.findFirst({
    where: { deletedAt: null, approvedAt: { not: null } },
    orderBy: { version: 'desc' },
    select: { id: true, version: true },
  });
}

function toSummary(row: {
  id: string;
  title: string;
  status: string;
  priority: string;
  sortOrder: number;
  specificationId: string | null;
  createdAt: Date;
  dependsOn: { prerequisite: { title: string; deletedAt: Date | null } }[];
}): TaskSummary {
  const dependencyTitles = row.dependsOn
    .filter((d) => d.prerequisite.deletedAt == null)
    .map((d) => d.prerequisite.title);
  return {
    id: row.id,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    sortOrder: row.sortOrder,
    specificationId: row.specificationId,
    dependencyTitles,
    createdAt: row.createdAt.toISOString(),
  };
}
