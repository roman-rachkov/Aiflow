/**
 * Unit tests for code:execute claim / resume (MVP-3 A1).
 */

import { describe, expect, it, vi } from 'vitest';

import { resolveCodeClaim, type ClaimDeps, type TaskRowWithGit } from './claim';

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
    now: () => new Date('2026-08-23T12:00:00.000Z'),
    ...overrides,
  };
}

describe('resolveCodeClaim happy paths', () => {
  it('claims PENDING → run', async () => {
    const d = deps();
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out).toEqual({ kind: 'run', task: expect.objectContaining({ id: 'task-1' }) });
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
  it('IN_PROGRESS without headCommit → run (stalled resume)', async () => {
    const d = deps({
      loadTask: vi.fn(() => Promise.resolve(task({ status: 'IN_PROGRESS' }))),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out.kind).toBe('run');
    expect(d.claimInProgress).not.toHaveBeenCalled();
  });

  it('IN_PROGRESS with headCommit → resume-after-push', async () => {
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
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out.kind).toBe('resume-after-push');
    if (out.kind === 'resume-after-push') {
      expect(out.task.headCommit).toBe('abc123');
    }
  });

  it('claim race then IN_PROGRESS+head → resume', async () => {
    const loadTask = vi
      .fn()
      .mockResolvedValueOnce(task({ status: 'PENDING' }))
      .mockResolvedValueOnce(
        task({
          status: 'IN_PROGRESS',
          headCommit: 'deadbeef',
          branchName: 'task/x',
        }),
      );
    const d = deps({
      loadTask,
      claimInProgress: vi.fn(() => Promise.resolve(false)),
    });
    const out = await resolveCodeClaim('schema', 'task-1', d);
    expect(out.kind).toBe('resume-after-push');
  });
});
