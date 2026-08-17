/**
 * Parse the latest `=== REVIEW ===` JSON block from TaskLog messages.
 */

export const REVIEW_LOG_MARKER = '=== REVIEW ===';

export type ParsedReviewVerdict = {
  verdict: 'ACCEPTED' | 'REJECTED';
  confidence: number;
  summary: string;
  suggestions?: string;
  issueCount: number;
};

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
  const issues = Array.isArray(details?.issues) ? details.issues : [];
  const suggestions = typeof details?.suggestions === 'string' ? details.suggestions : undefined;
  return {
    verdict: raw.verdict,
    confidence: raw.confidence,
    summary: raw.summary,
    suggestions,
    issueCount: issues.length,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}
