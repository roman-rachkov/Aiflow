import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collect } from './pairing.ts';
import { parseSince } from './transcript.ts';
import { buildReport } from './report.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/**
 * fork.jsonl deliberately repeats two entries (u1, u2) from parent.jsonl, the
 * way a resumed session does on disk. parent.jsonl ends with a truncated line,
 * the way a live transcript does mid-write.
 */
describe('collect', () => {
  const result = collect(FIXTURES, 0);

  it('deduplicates entries that a forked session repeats', () => {
    expect(result.duplicateEntriesSkipped).toBe(2);
    // t1 counted once despite appearing in both files.
    expect(result.calls.filter((c) => c.id === 't1')).toHaveLength(1);
  });

  it('survives a truncated final line', () => {
    expect(result.fileCount).toBe(2);
    expect(result.calls.length).toBeGreaterThan(0);
  });

  it('pairs results with their calls and marks errors', () => {
    const bash = result.calls.find((c) => c.name === 'Bash');
    expect(bash?.isError).toBe(true);
    expect(bash?.errorText).toContain('temporarily unavailable');

    const read = result.calls.find((c) => c.name === 'Read');
    expect(read?.isError).toBe(false);
  });

  it('counts denials and attributes calls to their sessions', () => {
    expect(result.denials['automode-unavailable']).toBe(1);
    expect(result.sessions.map((s) => s.sessionId).sort()).toEqual(['s1', 's2']);
  });

  it('honours the --since cutoff', () => {
    const future = collect(FIXTURES, Date.parse('2030-01-01T00:00:00.000Z'));
    expect(future.calls).toEqual([]);
  });
});

describe('parseSince', () => {
  it('accepts the documented windows', () => {
    expect(parseSince('all')).toBe(0);
    expect(parseSince('24h')).toBeGreaterThan(0);
    expect(parseSince('7d')).toBeLessThan(parseSince('24h'));
  });

  it('rejects anything else rather than silently analyzing everything', () => {
    expect(() => parseSince('last week')).toThrow(/Invalid --since/);
  });
});

describe('buildReport', () => {
  it('separates our errors from environmental ones in the totals', () => {
    const collected = collect(FIXTURES, 0);
    const report = buildReport({ ...collected, transcriptRoot: FIXTURES, since: 'all' });

    expect(report.overall.errors).toBe(report.overall.ourErrors + report.overall.environmentErrors);
    // The unavailable-classifier error is environmental; PowerShell is ours.
    expect(report.overall.environmentErrors).toBe(1);
    expect(report.overall.ourErrors).toBe(1);
    expect(report.capabilityGaps).toEqual([{ candidate: 'PowerShell', attempts: 1 }]);
  });
});
