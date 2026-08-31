/**
 * Append-only AuditEvent helpers (MVP-3 A3).
 * Writes go through the public schema; soft-delete does not apply.
 */

import type { Prisma } from '../generated/public';
import { getPublicClient } from './public-client';

export type AuditActorRole = 'CODER' | 'REVIEWER' | 'DEPLOYER' | 'SYSTEM';

export type RecordAuditInput = {
  projectId: string;
  taskId?: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string;
  beforeHash?: string | null;
  afterHash?: string | null;
  langfuseTraceId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type AuditEventRow = {
  id: string;
  projectId: string;
  taskId: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string;
  beforeHash: string | null;
  afterHash: string | null;
  langfuseTraceId: string | null;
  metadata: unknown;
  createdAt: Date;
};

/** Persist one significant role action. Never updates or deletes. */
export async function recordAudit(input: RecordAuditInput): Promise<AuditEventRow> {
  const row = await getPublicClient().auditEvent.create({
    data: {
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeHash: input.beforeHash ?? null,
      afterHash: input.afterHash ?? null,
      langfuseTraceId: input.langfuseTraceId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
  return toRow(row);
}

export type ListAuditOptions = {
  projectId: string;
  taskId?: string;
  take?: number;
};

/** Newest-first feed for a project (optional task filter). */
export async function listAuditEvents(opts: ListAuditOptions): Promise<AuditEventRow[]> {
  const take = Math.min(Math.max(opts.take ?? 100, 1), 500);
  const rows = await getPublicClient().auditEvent.findMany({
    where: {
      projectId: opts.projectId,
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take,
  });
  return rows.map(toRow);
}

function toRow(row: {
  id: string;
  projectId: string;
  taskId: string | null;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string;
  beforeHash: string | null;
  afterHash: string | null;
  langfuseTraceId: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditEventRow {
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    actorRole: row.actorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    beforeHash: row.beforeHash,
    afterHash: row.afterHash,
    langfuseTraceId: row.langfuseTraceId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}
