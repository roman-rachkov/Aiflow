/**
 * Unit tests for deploy:run claim (MVP-3 A1).
 */

import { describe, expect, it } from 'vitest';

import { resolveDeployClaim } from './claim';

describe('resolveDeployClaim', () => {
  it('BUILDING → run', () => {
    expect(
      resolveDeployClaim({
        id: 'd1',
        status: 'BUILDING',
        imageTag: null,
        url: null,
      }),
    ).toEqual({
      kind: 'run',
      deployment: expect.objectContaining({ id: 'd1' }),
    });
  });

  it('DEPLOYED → skip', () => {
    const out = resolveDeployClaim({
      id: 'd1',
      status: 'DEPLOYED',
      imageTag: 'aistudio/x:1',
      url: 'docker://aistudio/x:1',
    });
    expect(out.kind).toBe('skip-deployed');
  });

  it('FAILED → reject', () => {
    expect(
      resolveDeployClaim({
        id: 'd1',
        status: 'FAILED',
        imageTag: null,
        url: null,
      }),
    ).toEqual({ kind: 'reject', reason: 'Deployment already FAILED' });
  });

  it('null → reject', () => {
    expect(resolveDeployClaim(null).kind).toBe('reject');
  });
});
