/** DTOs for the Pro audit event feed (MVP-3 A3). */

export type AuditActorRole = 'CODER' | 'REVIEWER' | 'DEPLOYER' | 'SYSTEM';

export type AuditEventView = {
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
  createdAt: string;
};
