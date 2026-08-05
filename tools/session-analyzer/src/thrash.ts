import { signature } from './taxonomy.ts';
import type { AntiPattern, ThrashFinding, ToolCall } from './types.ts';

/**
 * Detect wasted motion: the same failure hit repeatedly, and tool choices that
 * had a better alternative available.
 *
 * The Bash checks encode a measured finding: a large share of Bash calls embed
 * cat/head/tail, grep/rg, or find — standing in for the dedicated Read/Grep/Glob
 * tools, which return structured, permission-integrated results where the shell
 * equivalents return raw text and cost a separate permission decision each time
 * (docs/17-session-review.md § 3.3). For those displacement patterns the KPI is
 * the ratio of embeds to dedicated-tool calls, not the raw embed count — a
 * warn-level hook advises but cannot suppress, so the count cannot fall; see
 * AntiPattern.displacementRatio and docs/17 § 3.10.
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

/** Embeds ÷ dedicated-tool calls, or undefined when no baseline exists. */
function displacementRatio(embeds: number, dedicated: number): number | undefined {
  if (dedicated === 0) return undefined;
  return Number((embeds / dedicated).toFixed(3));
}

interface DisplacementPattern {
  kind: string;
  /** Regex matching the shell builtin this pattern displaces a dedicated tool for. */
  embedRegex: RegExp;
  /** The dedicated tool whose calls form the denominator of the ratio. */
  dedicatedName: 'Read' | 'Grep' | 'Glob';
  /** Human-readable detail, given the embed and dedicated-tool counts. */
  detail: (embeds: number, dedicated: number) => string;
}

const DISPLACEMENT_PATTERNS: DisplacementPattern[] = [
  {
    kind: 'bash-instead-of-read',
    embedRegex: /\b(?:cat|head|tail)\b/,
    dedicatedName: 'Read',
    detail: (e, d) =>
      `${String(e)} Bash calls embed cat/head/tail, against ${String(d)} Read tool calls.`,
  },
  {
    kind: 'bash-instead-of-grep',
    embedRegex: /\b(?:grep|rg)\b/,
    dedicatedName: 'Grep',
    detail: (e, d) =>
      `${String(e)} Bash calls embed grep/rg, against ${String(d)} Grep tool calls.`,
  },
  {
    kind: 'bash-instead-of-glob',
    embedRegex: /\bfind\b/,
    dedicatedName: 'Glob',
    detail: (e) =>
      `${String(e)} Bash calls embed find; Glob returns the same paths already sorted.`,
  },
];

export function findAntiPatterns(calls: ToolCall[]): AntiPattern[] {
  const bash = calls.filter((c) => c.name === 'Bash');
  const dedicated = (name: 'Read' | 'Grep' | 'Glob') => calls.filter((c) => c.name === name).length;

  const cdPrefixed = bash.filter((c) => /^\s*cd\s/.test(commandOf(c))).length;

  const out: AntiPattern[] = [];
  if (cdPrefixed > 0) {
    out.push({
      kind: 'bash-cd-prefix',
      count: cdPrefixed,
      detail: `${String(cdPrefixed)} of ${String(bash.length)} Bash calls start with cd. The shell working directory resets between calls, so absolute paths belong in the command.`,
    });
  }
  for (const pattern of DISPLACEMENT_PATTERNS) {
    const embeds = bash.filter((c) => pattern.embedRegex.test(commandOf(c))).length;
    if (embeds === 0) continue;
    const dedicatedCalls = dedicated(pattern.dedicatedName);
    out.push({
      kind: pattern.kind,
      count: embeds,
      detail: pattern.detail(embeds, dedicatedCalls),
      displacementRatio: displacementRatio(embeds, dedicatedCalls),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}
