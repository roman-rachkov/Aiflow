/**
 * Shapes we read out of Claude Code transcripts, and the shape we emit.
 *
 * The transcript format is external and undocumented, so everything inbound is
 * optional and validated at the parse boundary (see transcript.ts). Only the
 * fields the analyzer actually uses are modelled — the real entries carry ~40
 * keys, and mirroring all of them would be drift waiting to happen.
 */

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

export type ContentBlock = ToolUseBlock | ToolResultBlock | { type: string };

/** One JSONL line, narrowed to what we consume. */
export interface TranscriptEntry {
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  gitBranch?: string;
  slug?: string;
  toolDenialKind?: string;
  message?: { content?: ContentBlock[] };
}

/** A tool_use paired with its tool_result, flattened for analysis. */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: string;
  isError: boolean;
  errorText: string;
}

export interface SessionSummary {
  sessionId: string;
  slug: string;
  gitBranch: string;
  startedAt: string;
  toolCalls: number;
  errors: number;
}

export interface ToolStat {
  name: string;
  calls: number;
  errors: number;
  errorRate: number;
}

export interface TaxonomyBucket {
  bucket: string;
  count: number;
  share: number;
  /**
   * Whether this class of failure is something we can fix. The load-bearing
   * field of the whole report — see docs/17-session-review.md § 3.1.
   */
  ourProblem: boolean;
  topSignatures: { signature: string; count: number }[];
}

export interface ThrashFinding {
  tool: string;
  signature: string;
  repeats: number;
  sessionId: string;
}

export interface AntiPattern {
  kind: string;
  count: number;
  detail: string;
  /**
   * Bash-embeds ÷ dedicated-tool calls. The KPI for warn-level enforcement — a
   * warn advises but does not suppress, so `count` cannot fall and grows with
   * session volume; the ratio is what tracks whether displacement is shrinking.
   * Omitted where there is no dedicated tool to displace (cd-prefix) or when the
   * dedicated-tool count is zero (no baseline). docs/17-session-review.md § 3.10.
   */
  displacementRatio?: number;
}

export interface CapabilityGap {
  candidate: string;
  attempts: number;
}

export interface Report {
  meta: {
    generatedAt: string;
    since: string;
    transcriptRoot: string;
    fileCount: number;
    duplicateEntriesSkipped: number;
  };
  overall: {
    sessions: number;
    toolCalls: number;
    errors: number;
    errorRate: number;
    ourErrors: number;
    environmentErrors: number;
  };
  sessions: SessionSummary[];
  byTool: ToolStat[];
  taxonomy: TaxonomyBucket[];
  denials: Record<string, number>;
  thrash: ThrashFinding[];
  antiPatterns: AntiPattern[];
  capabilityGaps: CapabilityGap[];
}
