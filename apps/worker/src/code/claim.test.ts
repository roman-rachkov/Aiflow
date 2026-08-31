/**
 * Unit tests for code:execute claim / resume (MVP-3 A1 + A2).
 */

import { describe, expect, it, vi } from 'vitest';

import { resolveCodeClaim, type ClaimDeps, type TaskRowWithGit } from './claim';
import { ATTEMPT_MARKER, stepDoneMarker } from './pipeline-steps';

function task(overrides: Partial<TaskRowWithGit> = {}): TaskRowWithGit {
  return {
    id: 'task-1',
    title: 'T',
    description: 'd',
    acceptance: 'a',
    status: 'PENDING',
    branchName: null,
    headCommit: null,
    ...overrides,
  };
}

function deps(overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    loadTask: vi.fn(() => Promise.resolve(task())),
    claimInProgress: vi.fn(() => Promise.resolve(true)),
    listTaskLogMessages: vi.fn(() => Promise.resolve([])),
    now: () => new Date('2026-08-23T12:00:00.000Z'),
    ...overrides,
  };
}

describe('resolveCodeClaim happy paths', () => {
  it('claims PENDING → run from CLONE (fresh attempt)', async () => {
    const d = deps();
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toEqual({
      kind: 'run',
      task: expect.objectContaining({ id: 'task-1' }),
      resumeFrom: 'CLONE',
      freshAttempt: true,
    });
    expect(d.claimInProgress).toHaveBeenCalled();
  });

  it('skips DONE', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'DONE' }))),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out.kind).toBe('skip-done');
    expect(d.claimInProgress).not.toHaveBeenCalled();
  });

  it('rejects CANCELLED', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'CANCELLED' }))),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toEqual({ kind: 'reject', reason: 'Task is CANCELLED' });
  });
});

describe('resolveCodeClaim resume', () => {
  it('IN_PROGRESS without headCommit → run from CLONE', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'IN_PROGRESS' }))),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toMatchObject({ kind: 'run', resumeFrom: 'CLONE', freshAttempt: false });
    expect(d.claimInProgress).not.toHaveBeenCalled();
  });

  it('IN_PROGRESS with headCommit → resume at PUSH', async () => {
    const d = deps({
      loadTask: vi.fn(() =>
        Promise.resolve(
          task({
            status: 'IN_PROGRESS',
            headCommit: 'abc123',
            branchName: 'task/task-1-t',
          }),
        ),
      ),
      listTaskLogMessages: vi.fn(() =>
        Promise.resolve([`${ATTEMPT_MARKER}\n`, `${stepDoneMarker('PARSE')}\n`]),
      ),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toMatchObject({ kind: 'run', resumeFrom: 'PUSH', freshAttempt: false });
  });
});

describe('resolveCodeClaim late resume', () => {
  it('IN_PROGRESS with PUSH done → resume at DONE', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'IN_PROGRESS', headCommit: 'abc' }))),
      listTaskLogMessages: vi.fn(() => Promise.resolve([`${stepDoneMarker('PUSH')}\n`])),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toMatchObject({ kind: 'run', resumeFrom: 'DONE' });
  });

  it('pipeline COMPLETE when PUSH+DONE checkpointed', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'IN_PROGRESS', headCommit: 'abc' }))),
      listTaskLogMessages: vi.fn(() =>
        Promise.resolve([`${stepDoneMarker('PUSH')}\n`, `${stepDoneMarker('DONE')}\n`]),
      ),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out.kind).toBe('pipeline-complete');
  });
});
