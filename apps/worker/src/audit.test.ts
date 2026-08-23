import { describe, expect, it, vi } from 'vitest';

import {
  auditCoderPush,
  auditDeployFinish,
  auditReviewerVerdict,
  type RecordAuditFn,
} from './audit';

function mockRecord(): ReturnType<typeof vi.fn<RecordAuditFn>> {
  return vi.fn<RecordAuditFn>(() => Promise.resolve({}));
}

describe('auditCoderPush', () => {
  it('records coder.push with head commit as afterHash', async () => {
    const record = mockRecord();
    await auditCoderPush(record, {
      projectId: 'p1',
      taskId: 't1',
      headCommit: 'abc123',
      branchName: 'task/t1',
    });
    expect(record).toHaveBeenCalledWith({
      projectId: 'p1',
      taskId: 't1',
      actorRole: 'CODER',
      action: 'coder.push',
      targetType: 'Task',
      targetId: 't1',
      afterHash: 'abc123',
      metadata: { branchName: 'task/t1' },
    });
  });
});

describe('auditReviewerVerdict', () => {
  it('records reviewer.verdict with optional trace id', async () => {
    const record = mockRecord();
    await auditReviewerVerdict(record, {
      projectId: 'p1',
      taskId: 't1',
      verdict: 'ACCEPTED',
      confidence: 0.9,
      langfuseTraceId: 'lf-1',
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorRole: 'REVIEWER',
        action: 'reviewer.verdict',
        langfuseTraceId: 'lf-1',
        metadata: { verdict: 'ACCEPTED', confidence: 0.9 },
      }),
    );
  });
});

describe('auditDeployFinish', () => {
  it('records deploy.finish without taskId', async () => {
    const record = mockRecord();
    await auditDeployFinish(record, {
      projectId: 'p1',
      deploymentId: 'd1',
      status: 'DEPLOYED',
      imageTag: 'aistudio/repo:1',
    });
    expect(record).toHaveBeenCalledWith({
      projectId: 'p1',
      actorRole: 'DEPLOYER',
      action: 'deploy.finish',
      targetType: 'Deployment',
      targetId: 'd1',
      afterHash: 'aistudio/repo:1',
      metadata: { status: 'DEPLOYED' },
    });
  });
});
