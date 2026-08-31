/**
 * Parse the latest `=== REVIEW ===` JSON block from TaskLog messages.
 * Extended for MVP-3 D1: includes issues array, auto-approve threshold.
 */

export const REVIEW_LOG_MARKER = '=== REVIEW ===';

/** Confidence threshold above which an ACCEPTED verdict is considered auto-approvable. */
export const AUTO_APPROVE_THRESHOLD = 0.85;

export type ReviewIssueSeverity = 'error' | 'warning' | 'info';

export type ReviewIssue = {
  file: string;
  line: number | string;
  severity: ReviewIssueSeverity;
  description: string;
};

export type ParsedReviewVerdict = {
  verdict: 'ACCEPTED' | 'REJECTED';
  confidence: number;
  summary: string;
  suggestions?: string;
  issueCount: number;
  issues: ReviewIssue[];
};

/** Returns true when the verdict qualifies for auto-approval. */
export function isAutoApproved(verdict: ParsedReviewVerdict): boolean {
  return verdict.verdict === 'ACCEPTED' && verdict.confidence >= AUTO_APPROVE_THRESHOLD;
}

/** Find the last review marker in concatenated log text and parse JSON after it. */
export function parseLatestReview(logText: string): ParsedReviewVerdict | null {
  const idx = logText.lastIndexOf(REVIEW_LOG_MARKER);
  if (idx < 0) return null;
  const after = logText.slice(idx + REVIEW_LOG_MARKER.length).trim();
  const line = after.split('\n').find((l) => l.trim().startsWith('{'));
  if (!line) return null;
  return parseReviewJsonLine(line);
}

function parseReviewJsonLine(line: string): ParsedReviewVerdict | null {
  try {
    return mapReviewJson(JSON.parse(line) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function mapReviewJson(raw: Record<string, unknown>): ParsedReviewVerdict | null {
  if (raw.verdict !== 'ACCEPTED' && raw.verdict !== 'REJECTED') return null;
  if (typeof raw.confidence !== 'number' || typeof raw.summary !== 'string') return null;
  const details = asRecord(raw.details);
  const rawIssues: unknown[] =
    details !== null && Array.isArray(details.issues) ? (details.issues as unknown[]) : [];
  const issues = rawIssues.flatMap(mapIssue);
  const suggestions =
    details !== null && typeof details.suggestions === 'string' ? details.suggestions : undefined;
  return {
    verdict: raw.verdict,
    confidence: raw.confidence,
    summary: raw.summary,
    suggestions,
    issueCount: issues.length,
    issues,
  };
}

function mapIssue(item: unknown): ReviewIssue[] {
  const r = asRecord(item);
  if (!r || typeof r.file !== 'string' || typeof r.description !== 'string') return [];
  const line: number | string =
    typeof r.line === 'number' ? r.line : typeof r.line === 'string' ? r.line : 0;
  return [{ file: r.file, line, severity: toSeverity(r.severity), description: r.description }];
}

function toSeverity(value: unknown): ReviewIssueSeverity {
  if (value === 'error' || value === 'warning' || value === 'info') return value;
  return 'info';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}
