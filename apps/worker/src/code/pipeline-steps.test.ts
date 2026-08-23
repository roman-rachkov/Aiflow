/**
 * Unit tests for pipeline step encoding (MVP-3 A2).
 */

import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_MARKER,
  checkpointRefName,
  firstUnfinishedStep,
  isBeforeStep,
  parseCompletedSteps,
  stepDoneMarker,
} from './pipeline-steps';

describe('pipeline-steps markers', () => {
  it('builds checkpoint ref and step markers', () => {
    expect(checkpointRefName('task-1')).toBe('refs/aistudio/task/task-1');
    expect(stepDoneMarker('PUSH')).toBe('=== PIPELINE_STEP:PUSH ===');
  });

  it('isBeforeStep orders the pipeline', () => {
    expect(isBeforeStep('SANDBOX', 'PUSH')).toBe(true);
    expect(isBeforeStep('PUSH', 'PUSH')).toBe(false);
    expect(isBeforeStep('DONE', 'PUSH')).toBe(false);
  });
});

describe('parseCompletedSteps / firstUnfinishedStep', () => {
  it('reads steps only after the latest attempt marker', () => {
    const messages = [
      `${ATTEMPT_MARKER}\n`,
      `${stepDoneMarker('CLONE')}\n`,
      `${ATTEMPT_MARKER}\n`,
      `${stepDoneMarker('CLONE')}\n`,
      `${stepDoneMarker('CHECKOUT')}\n`,
      `${stepDoneMarker('SANDBOX')}\n`,
      `${stepDoneMarker('PARSE')}\n`,
    ];
    expect(parseCompletedSteps(messages)).toEqual(['CLONE', 'CHECKOUT', 'SANDBOX', 'PARSE']);
  });

  it('without headCommit always resumes at CLONE (workDir ephemeral)', () => {
    expect(firstUnfinishedStep(['CLONE', 'SANDBOX'], null)).toBe('CLONE');
  });

  it('with headCommit resumes at PUSH until PUSH checkpointed', () => {
    expect(firstUnfinishedStep(['PARSE'], 'abc')).toBe('PUSH');
    expect(firstUnfinishedStep(['PARSE', 'PUSH'], 'abc')).toBe('DONE');
    expect(firstUnfinishedStep(['PARSE', 'PUSH', 'DONE'], 'abc')).toBe('COMPLETE');
  });
});
