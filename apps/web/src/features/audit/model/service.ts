/**
 * List AuditEvent rows for a project (optional task filter).
 */

import { listAuditEvents } from '@aiflow/db';

import type { AuditEventView } from './types';

/** Chronological feed — oldest first so a taskId reconstructs history in order. */
export async function listProjectAudit(
  projectId: string,
  taskId?: string,
): Promise<AuditEventView[]> {
  const rows = await listAuditEvents({
    projectId,
    ...(taskId ? { taskId } : {}),
    take: 200,
  });
  return rows.map((row) => ({
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
    createdAt: row.createdAt.toISOString(),
  }));
}
