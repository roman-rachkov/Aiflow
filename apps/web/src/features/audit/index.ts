/**
 * Public surface of the audit feature slice (MVP-3 A3).
 * UI lives in `./client` so this barrel stays server-safe.
 */

export type { AuditEventView, AuditActorRole } from './model/types';
export { assertProAudit } from './model/access';
export type { ProApiUser } from './model/access';
export { listProjectAudit } from './model/service';
