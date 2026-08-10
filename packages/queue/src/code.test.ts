import { describe, expect, it } from 'vitest';

import {
  CODE_JOB_OPTIONS,
  sandboxLogsChannel,
  validateCodePayload,
  type CodeExecutePayload,
} from './code';
import { QUEUE_CODE_EXECUTE } from './names';

const PAYLOAD: CodeExecutePayload = {
  projectId: 'proj-1',
  schemaName: 'project_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  taskId: 'task-1',
  giteaOwner: 'aistudio',
  giteaRepo: 'demo',
  giteaDefaultBranch: 'main',
  dryRun: true,
};

describe('validateCodePayload', () => {
  it('accepts a complete payload', () => {
    expect(() => {
      validateCodePayload(PAYLOAD);
    }).not.toThrow();
  });

  it('rejects missing string fields', () => {
    expect(() => {
      validateCodePayload({ ...PAYLOAD, taskId: '' });
    }).toThrow(/taskId/);
  });

  it('rejects non-boolean dryRun', () => {
    expect(() => {
      validateCodePayload({ ...PAYLOAD, dryRun: 'yes' as unknown as boolean });
    }).toThrow(/dryRun/);
  });
});

describe('sandboxLogsChannel', () => {
  it('uses task id', () => {
    expect(sandboxLogsChannel('abc')).toBe('sandbox:logs:abc');
  });
});

describe('code queue constants', () => {
  it('exports fail-fast job options and queue name', () => {
    expect(QUEUE_CODE_EXECUTE).toBe('code-execute');
    expect(CODE_JOB_OPTIONS.attempts).toBe(1);
  });
});
