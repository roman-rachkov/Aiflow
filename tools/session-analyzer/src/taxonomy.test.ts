import { describe, expect, it } from 'vitest';

import { classify, buildTaxonomy, signature } from './taxonomy.ts';
import { findCapabilityGaps } from './gaps.ts';
import { findAntiPatterns, findThrash } from './thrash.ts';
import type { ToolCall } from './types.ts';

function call(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'toolu_1',
    name: 'Bash',
    input: {},
    sessionId: 's1',
    timestamp: '2026-08-04T10:00:00.000Z',
    isError: false,
    errorText: '',
    ...overrides,
  };
}

function errorCall(errorText: string, overrides: Partial<ToolCall> = {}): ToolCall {
  return call({ isError: true, errorText, ...overrides });
}

describe('classify', () => {
  // One case per bucket, using the real messages measured in the corpus.
  const cases: [string, string, boolean][] = [
    [
      'smart[1m] is temporarily unavailable, so auto mode cannot determine',
      'model-unavailable',
      false,
    ],
    ['Agent terminated early due to an API error: API Error: 405', 'subagent-api-error', false],
    [
      '<tool_use_error>Error: No such tool available: PowerShell</tool_use_error>',
      'missing-tool',
      true,
    ],
    ['File has not been read yet. Read it first before writing to it', 'protocol-misuse', true],
    ['File does not exist. Note: your current working directory is', 'path-not-found', true],
    ['Ripgrep search timed out after 20 seconds', 'timeout', true],
    ["The user doesn't want to proceed with this tool use", 'user-rejected', true],
    ['Permission for this action was denied by the Claude Code auto', 'permission-denied', true],
    ['Exit code 1: something broke', 'command-failure', true],
  ];

  it.each(cases)('classifies %s', (text, bucket, ourProblem) => {
    const rule = classify(text);
    expect(rule.bucket).toBe(bucket);
    expect(rule.ourProblem).toBe(ourProblem);
  });

  it('prefers the specific rule when messages overlap', () => {
    // "No such tool available" would also match nothing else, but a message that
    // mentions both unavailability and a missing tool must not fall through to
    // the environment bucket and get excused.
    expect(classify('No such tool available: PowerShell').ourProblem).toBe(true);
  });
});

describe('buildTaxonomy', () => {
  it('splits our problems from environmental noise', () => {
    const calls = [
      errorCall('smart[1m] is temporarily unavailable, so auto mode cannot determine'),
      errorCall('smart[1m] is temporarily unavailable, so auto mode cannot determine'),
      errorCall('File does not exist. Note: your current working directory is'),
      call(),
    ];
    const taxonomy = buildTaxonomy(calls);
    const environment = taxonomy.filter((b) => !b.ourProblem);
    const ours = taxonomy.filter((b) => b.ourProblem);

    expect(environment.reduce((n, b) => n + b.count, 0)).toBe(2);
    expect(ours.reduce((n, b) => n + b.count, 0)).toBe(1);
    // Shares are over errors, not over all calls — the healthy call is excluded.
    expect(taxonomy[0]?.share).toBeCloseTo(0.667, 2);
  });

  it('returns an empty taxonomy when nothing failed', () => {
    expect(buildTaxonomy([call(), call()])).toEqual([]);
  });
});

describe('signature', () => {
  it('collapses whitespace and strips the error wrapper', () => {
    expect(signature('<tool_use_error>Error:   No such\n  tool</tool_use_error>')).toBe(
      'Error: No such tool',
    );
  });
});

describe('findCapabilityGaps', () => {
  it('counts attempts at tools that do not exist', () => {
    const calls = [
      errorCall('No such tool available: PowerShell'),
      errorCall('No such tool available: PowerShell'),
      errorCall('No such tool available: Docker'),
      errorCall('File does not exist'),
    ];
    expect(findCapabilityGaps(calls)).toEqual([
      { candidate: 'PowerShell', attempts: 2 },
      { candidate: 'Docker', attempts: 1 },
    ]);
  });
});

describe('findThrash', () => {
  it('reports a failure repeated at least three times in one session', () => {
    const repeated = Array.from({ length: 3 }, () =>
      errorCall('Ripgrep search timed out after 20 seconds'),
    );
    const findings = findThrash([...repeated, errorCall('File does not exist')]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.repeats).toBe(3);
  });

  it('does not report the same failure across different sessions as thrash', () => {
    const spread = ['s1', 's2', 's3'].map((sessionId) =>
      errorCall('Ripgrep search timed out', { sessionId }),
    );
    expect(findThrash(spread)).toEqual([]);
  });
});

describe('findAntiPatterns', () => {
  it('flags Bash standing in for the dedicated tools', () => {
    const calls = [
      call({ input: { command: 'cd /tmp && ls' } }),
      call({ input: { command: 'grep -r foo .' } }),
      call({ input: { command: 'cat package.json' } }),
      call({ input: { command: 'find . -name "*.ts"' } }),
      call({ name: 'Grep' }),
    ];
    const kinds = findAntiPatterns(calls).map((p) => p.kind);
    expect(kinds).toContain('bash-cd-prefix');
    expect(kinds).toContain('bash-instead-of-grep');
    expect(kinds).toContain('bash-instead-of-read');
    expect(kinds).toContain('bash-instead-of-glob');
  });

  it('reports the displacement ratio as embeds / dedicated-tool calls', () => {
    // 3 cat-embeds against 1 Read call => ratio 3. 2 grep-embeds against 1 Grep
    // => ratio 2. cd-prefix has no dedicated tool, so no ratio at all.
    const calls = [
      call({ input: { command: 'cat a' } }),
      call({ input: { command: 'cat b' } }),
      call({ input: { command: 'cat c' } }),
      call({ name: 'Read' }),
      call({ input: { command: 'grep x .' } }),
      call({ input: { command: 'grep y .' } }),
      call({ name: 'Grep' }),
      call({ input: { command: 'cd /tmp && ls' } }),
    ];
    const byKind = new Map(findAntiPatterns(calls).map((p) => [p.kind, p]));
    expect(byKind.get('bash-instead-of-read')?.displacementRatio).toBe(3);
    expect(byKind.get('bash-instead-of-grep')?.displacementRatio).toBe(2);
    expect(byKind.get('bash-cd-prefix')?.displacementRatio).toBeUndefined();
  });

  it('omits the ratio when the dedicated-tool count is zero', () => {
    // find-embeds but no Glob call: no baseline to ratio against.
    const calls = [call({ input: { command: 'find . -name "*.ts"' } })];
    expect(findAntiPatterns(calls)[0]?.displacementRatio).toBeUndefined();
  });

  it('stays silent when Bash is used for real commands', () => {
    const calls = [
      call({ input: { command: 'git status' } }),
      call({ input: { command: 'yarn verify' } }),
    ];
    expect(findAntiPatterns(calls)).toEqual([]);
  });
});
