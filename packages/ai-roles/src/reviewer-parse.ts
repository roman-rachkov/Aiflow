/**
 * Reviewer JSON parse helpers (kept separate so reviewer.ts stays ≤200 lines).
 */

import type {
  ReviewIssue,
  ReviewIssueSeverity,
  ReviewVerdict,
  ReviewVerdictKind,
} from './reviewer';

const SEVERITIES = new Set<string>(['error', 'warning', 'info']);

/** Extract a JSON object from model text (raw or fenced). */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Reviewer response has no JSON object');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

/** Parse and validate Reviewer JSON into a ReviewVerdict. */
export function parseReviewVerdict(raw: string): ReviewVerdict {
  const data = extractJsonObject(raw);
  if (!data || typeof data !== 'object') {
    throw new Error('Reviewer JSON root is not an object');
  }
  const row = data as Record<string, unknown>;
  return {
    verdict: parseVerdictKind(row.verdict),
    confidence: parseConfidence(row.confidence),
    summary: requireString(row.summary, 'summary'),
    details: parseDetails(row.details),
  };
}

function parseVerdictKind(value: unknown): ReviewVerdictKind {
  if (value === 'ACCEPTED' || value === 'REJECTED') return value;
  throw new Error('Reviewer verdict must be ACCEPTED or REJECTED');
}

function parseConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error('Reviewer confidence must be a number from 0 to 1');
  }
  return value;
}

function parseDetails(value: unknown): ReviewVerdict['details'] {
  if (!value || typeof value !== 'object') {
    throw new Error('Reviewer details must be an object');
  }
  const d = value as Record<string, unknown>;
  return {
    acceptance_met: requireBool(d.acceptance_met, 'details.acceptance_met'),
    compilation: requireBool(d.compilation, 'details.compilation'),
    lint: requireBool(d.lint, 'details.lint'),
    tests: parseTests(d.tests),
    issues: parseIssues(d.issues),
    suggestions: typeof d.suggestions === 'string' ? d.suggestions : '',
  };
}

function parseTests(value: unknown): boolean | null {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  throw new Error('Reviewer details.tests must be boolean or null');
}

function parseIssues(value: unknown): ReviewIssue[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error('Reviewer details.issues must be an array');
  }
  return value.map((item, i) => parseIssue(item, i));
}

function parseIssue(item: unknown, index: number): ReviewIssue {
  const idx = String(index);
  if (!item || typeof item !== 'object') {
    throw new Error(`Reviewer issue[${idx}] is not an object`);
  }
  const row = item as Record<string, unknown>;
  const severity = typeof row.severity === 'string' ? row.severity : '';
  if (!SEVERITIES.has(severity)) {
    throw new Error(`Reviewer issue[${idx}].severity invalid`);
  }
  const line = row.line;
  if (typeof line !== 'number' && typeof line !== 'string') {
    throw new Error(`Reviewer issue[${idx}].line invalid`);
  }
  return {
    file: requireString(row.file, `issue[${idx}].file`),
    line,
    severity: severity as ReviewIssueSeverity,
    description: requireString(row.description, `issue[${idx}].description`),
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reviewer ${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireBool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Reviewer ${label} must be boolean`);
  }
  return value;
}
