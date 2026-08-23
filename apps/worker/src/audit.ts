/**
 * Worker-side audit recording (MVP-3 A3). Thin wrapper so handlers stay
 * injectable and unit tests can noop without a DB.
 */

import { recordAudit, type RecordAuditInput } from '@aiflow/db';

export type RecordAuditFn = (input: RecordAuditInput) => Promise<unknown>;

/** Default: persist via @aiflow/db into public.AuditEvent. */
export const defaultRecordAudit: RecordAuditFn = (input) => recordAudit(input);

/** Coder pushed a task branch — afterHash is the git head commit. */
export async function auditCoderPush(
  record: RecordAuditFn,
  args: {
    projectId: string;
    taskId: string;
    headCommit: string;
    branchName: string;
  },
): Promise<void> {
  await record({
    projectId: args.projectId,
    taskId: args.taskId,
    actorRole: 'CODER',
    action: 'coder.push',
    targetType: 'Task',
    targetId: args.taskId,
    afterHash: args.headCommit,
    metadata: { branchName: args.branchName },
  });
}

/** Reviewer settled a verdict — metadata carries ACCEPTED/REJECTED. */
export async function auditReviewerVerdict(
  record: RecordAuditFn,
  args: {
    projectId: string;
    taskId: string;
    verdict: string;
    confidence?: number;
    langfuseTraceId?: string | null;
  },
): Promise<void> {
  await record({
    projectId: args.projectId,
    taskId: args.taskId,
    actorRole: 'REVIEWER',
    action: 'reviewer.verdict',
    targetType: 'Task',
    targetId: args.taskId,
    langfuseTraceId: args.langfuseTraceId ?? null,
    metadata: {
      verdict: args.verdict,
      ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
    },
  });
}

/** Deploy finished (success or fail) — afterHash is the image tag when set. */
export async function auditDeployFinish(
  record: RecordAuditFn,
  args: {
    projectId: string;
    deploymentId: string;
    status: 'DEPLOYED' | 'FAILED';
    imageTag?: string | null;
  },
): Promise<void> {
  await record({
    projectId: args.projectId,
    actorRole: 'DEPLOYER',
    action: 'deploy.finish',
    targetType: 'Deployment',
    targetId: args.deploymentId,
    afterHash: args.imageTag ?? null,
    metadata: { status: args.status },
  });
}
