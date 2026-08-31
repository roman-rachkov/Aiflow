import { describe, expect, it, vi } from 'vitest';

import type { Job } from 'bullmq';
import type { ReviewVerdict } from '@aiflow/ai-roles';
import type { CodeReviewPayload } from '@aiflow/queue';

vi.mock('@aiflow/db', () => ({
  ensureTaskGitColumns: vi.fn(() => Promise.resolve()),
}));

import { applyReviewVerdict, formatReviewLog, REVIEW_LOG_MARKER } from './apply-verdict';
import { handleCodeReview, type ReviewHandlerDeps } from './handler';
import { MAX_REVIEW_RETRIES } from './retry';

const PAYLOAD: CodeReviewPayload = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  taskId: 'task-1',
  branchName: 'task/task-1-add',
  diff: 'diff --git a/x b/x\n+hello\n',
  checks: { typescript: true, eslint: true, tests: null },
};

const TASK = {
  id: PAYLOAD.taskId,
  title: 'Add model',
  description: 'Create Recipe',
  acceptance: 'Table exists',
  status: 'IN_PROGRESS' as const,
  branchName: 'task/task-1-add',
  headCommit: 'abc',
};

const ACCEPTED: ReviewVerdict = {
  verdict: 'ACCEPTED',
  confidence: 0.91,
  summary: 'OK',
  details: {
    acceptance_met: true,
    compilation: true,
    lint: true,
    tests: null,
    issues: [],
    suggestions: '',
  },
};

const REJECTED: ReviewVerdict = {
  ...ACCEPTED,
  verdict: 'REJECTED',
  summary: 'Missing search',
  details: { ...ACCEPTED.details, acceptance_met: false },
};

function job(data: CodeReviewPayload): Job<CodeReviewPayload> {
  return { data, id: data.taskId } as Job<CodeReviewPayload>;
}

const GITEA = { giteaOwner: 'aistudio', giteaRepo: 'demo', giteaDefaultBranch: 'main' };

function mockDeps(overrides: Partial<ReviewHandlerDeps> = {}): ReviewHandlerDeps {
  const applyVerdict = {
    appendTaskLog: vi.fn(() => Promise.resolve()),
    setTaskStatus: vi.fn(() => Promise.resolve()),
    now: () => new Date('2026-08-11T00:00:00.000Z'),
  };
  return {
    loadTask: vi.fn(() => Promise.resolve(TASK)),
    generateVerdict: vi.fn(() => Promise.resolve(ACCEPTED)),
    applyVerdict,
    finishAccepted: {
      mergeTaskBranch: vi.fn(() => Promise.resolve('sha-main')),
      recordTaskGit: vi.fn(() => Promise.resolve()),
      enqueueReadyTasks: vi.fn(() => Promise.resolve([])),
      loadGitea: vi.fn(() => Promise.resolve(GITEA)),
      applyVerdict,
    },
    enqueueCodeExecute: vi.fn(() => Promise.resolve()),
    recordAudit: vi.fn(() => Promise.resolve({})),
    ...overrides,
  };
}

describe('formatReviewLog', () => {
  it('includes the marker and JSON', () => {
    const text = formatReviewLog(ACCEPTED);
    expect(text.startsWith(REVIEW_LOG_MARKER)).toBe(true);
    expect(text).toContain('"verdict":"ACCEPTED"');
  });
});

describe('applyReviewVerdict', () => {
  it('ACCEPTED → DONE', async () => {
    const deps = mockDeps().applyVerdict;
    await applyReviewVerdict(PAYLOAD.schemaName, PAYLOAD.taskId, ACCEPTED, deps);
    expect(deps.setTaskStatus).toHaveBeenCalledWith(expect.objectContaining({ status: 'DONE' }));
  });

  it('REJECTED → PENDING', async () => {
    const deps = mockDeps().applyVerdict;
    await applyReviewVerdict(PAYLOAD.schemaName, PAYLOAD.taskId, REJECTED, deps);
    expect(deps.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING', completedAt: null }),
    );
  });
});

describe('handleCodeReview', () => {
  it('loads task, generates verdict, applies ACCEPTED', async () => {
    const deps = mockDeps();
    const v = await handleCodeReview(job(PAYLOAD), deps);
    expect(v.verdict).toBe('ACCEPTED');
    expect(deps.generateVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ title: TASK.title, diff: PAYLOAD.diff }),
    );
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DONE' }),
    );
    expect(deps.finishAccepted.mergeTaskBranch).toHaveBeenCalled();
    expect(deps.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'reviewer.verdict',
        metadata: expect.objectContaining({ verdict: 'ACCEPTED' }),
      }),
    );
  });

  it('throws when task is missing', async () => {
    const deps = mockDeps({ loadTask: vi.fn(() => Promise.resolve(null)) });
    await expect(handleCodeReview(job(PAYLOAD), deps)).rejects.toThrow(/not found/);
  });

  it('REJECTED does not merge', async () => {
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    const v = await handleCodeReview(job(PAYLOAD), deps);
    expect(v.verdict).toBe('REJECTED');
    expect(deps.finishAccepted.mergeTaskBranch).not.toHaveBeenCalled();
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

  it('merge failure → FAILED', async () => {
    const deps = mockDeps();
    vi.mocked(deps.finishAccepted.mergeTaskBranch).mockRejectedValue(new Error('not ff'));
    await handleCodeReview(job(PAYLOAD), deps);
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });
});

describe('handleCodeReview — Self-Refine (MVP-3 C1)', () => {
  it('REJECTED on first attempt re-enqueues code-execute with retryCount=1', async () => {
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    await handleCodeReview(job(PAYLOAD), deps);
    expect(deps.enqueueCodeExecute).toHaveBeenCalledOnce();
    const enqueued = vi.mocked(deps.enqueueCodeExecute).mock.calls[0][0];
    expect(enqueued.retryCount).toBe(1);
    expect(enqueued.reviewFeedback).toContain('Missing search');
    expect(enqueued.giteaOwner).toBe(GITEA.giteaOwner);
  });

  it('REJECTED carries retryCount through from payload', async () => {
    const payloadRetry1: CodeReviewPayload = { ...PAYLOAD, retryCount: 1 };
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    await handleCodeReview(job(payloadRetry1), deps);
    const enqueued = vi.mocked(deps.enqueueCodeExecute).mock.calls[0][0];
    expect(enqueued.retryCount).toBe(2);
  });

  it('REJECTED at cap → FAILED, no re-enqueue', async () => {
    const payloadCapped: CodeReviewPayload = { ...PAYLOAD, retryCount: MAX_REVIEW_RETRIES };
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    await handleCodeReview(job(payloadCapped), deps);
    expect(deps.enqueueCodeExecute).not.toHaveBeenCalled();
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('REJECTED with missing Gitea info → FAILED', async () => {
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    vi.mocked(deps.finishAccepted.loadGitea).mockResolvedValue(null);
    await handleCodeReview(job(PAYLOAD), deps);
    expect(deps.enqueueCodeExecute).not.toHaveBeenCalled();
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('REJECTED still writes PENDING status before re-enqueue', async () => {
    const deps = mockDeps({ generateVerdict: vi.fn(() => Promise.resolve(REJECTED)) });
    await handleCodeReview(job(PAYLOAD), deps);
    expect(deps.applyVerdict.setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });
});
