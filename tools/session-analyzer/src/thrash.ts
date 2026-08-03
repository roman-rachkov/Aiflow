import { signature } from './taxonomy.ts';
import type { AntiPattern, ThrashFinding, ToolCall } from './types.ts';

/**
 * Detect wasted motion: the same failure hit repeatedly, and tool choices that
 * had a better alternative available.
 *
 * The Bash checks encode a measured finding — 775 Bash calls against 125 Grep
 * calls, with 239 of the Bash calls embedding grep/rg. The dedicated tools
 * return structured, permission-integrated results; the shell equivalents return
 * raw text and cost a separate permission decision each time
 * (docs/17-session-review.md § 3.3).
 */

const MIN_REPEATS = 3;

export function findThrash(calls: ToolCall[]): ThrashFinding[] {
  const counts = new Map<string, { tool: string; sig: string; sessionId: string; n: number }>();

  for (const call of calls) {
    if (!call.isError) continue;
    const sig = signature(call.errorText);
    const key = `${call.sessionId}::${call.name}::${sig}`;
    const existing = counts.get(key);
    if (existing) existing.n += 1;
    else counts.set(key, { tool: call.name, sig, sessionId: call.sessionId, n: 1 });
  }

  return [...counts.values()]
    .filter((entry) => entry.n >= MIN_REPEATS)
    .sort((a, b) => b.n - a.n)
    .slice(0, 20)
    .map((entry) => ({
      tool: entry.tool,
      signature: entry.sig,
      repeats: entry.n,
      sessionId: entry.sessionId,
    }));
}

function commandOf(call: ToolCall): string {
  const raw = call.input['command'];
  return typeof raw === 'string' ? raw : '';
}

export function findAntiPatterns(calls: ToolCall[]): AntiPattern[] {
  const bash = calls.filter((c) => c.name === 'Bash');
  const grepCalls = calls.filter((c) => c.name === 'Grep').length;
  const readCalls = calls.filter((c) => c.name === 'Read').length;

  const cdPrefixed = bash.filter((c) => /^\s*cd\s/.test(commandOf(c))).length;
  const embeddedGrep = bash.filter((c) => /\b(?:grep|rg)\b/.test(commandOf(c))).length;
  const embeddedRead = bash.filter((c) => /\b(?:cat|head|tail)\b/.test(commandOf(c))).length;
  const embeddedFind = bash.filter((c) => /\bfind\b/.test(commandOf(c))).length;

  const out: AntiPattern[] = [];
  if (cdPrefixed > 0) {
    out.push({
      kind: 'bash-cd-prefix',
      count: cdPrefixed,
      detail: `${String(cdPrefixed)} of ${String(bash.length)} Bash calls start with cd. The shell working directory resets between calls, so absolute paths belong in the command.`,
    });
  }
  if (embeddedGrep > 0) {
    out.push({
      kind: 'bash-instead-of-grep',
      count: embeddedGrep,
      detail: `${String(embeddedGrep)} Bash calls embed grep/rg, against ${String(grepCalls)} Grep tool calls.`,
    });
  }
  if (embeddedRead > 0) {
    out.push({
      kind: 'bash-instead-of-read',
      count: embeddedRead,
      detail: `${String(embeddedRead)} Bash calls embed cat/head/tail, against ${String(readCalls)} Read tool calls.`,
    });
  }
  if (embeddedFind > 0) {
    out.push({
      kind: 'bash-instead-of-glob',
      count: embeddedFind,
      detail: `${String(embeddedFind)} Bash calls embed find; Glob returns the same paths already sorted.`,
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
