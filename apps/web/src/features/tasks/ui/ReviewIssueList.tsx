'use client';

import type { ReviewIssue, ReviewIssueSeverity } from './parse-review';

type Props = {
  issues: ReviewIssue[];
};

const COLLAPSE_THRESHOLD = 5;

const SEV_BADGE: Record<ReviewIssueSeverity, string> = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

const SEV_RU: Record<ReviewIssueSeverity, string> = {
  error: 'ошибка',
  warning: 'предупреждение',
  info: 'инфо',
};

/** Displays a list of review issues. Shows first N; remainder count noted inline. */
export function ReviewIssueList({ issues }: Props) {
  if (issues.length === 0) return null;
  const shown = issues.slice(0, COLLAPSE_THRESHOLD);
  const hidden = issues.length - shown.length;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {shown.map((issue) => (
        <IssueRow key={`${issue.file}:${String(issue.line)}:${issue.description}`} issue={issue} />
      ))}
      {hidden > 0 ? <li className="text-fg-muted">+ ещё {hidden} замечаний</li> : null}
    </ul>
  );
}

function IssueRow({ issue }: { issue: ReviewIssue }) {
  const loc = issue.line !== 0 ? `${issue.file}:${String(issue.line)}` : issue.file;
  return (
    <li className="flex flex-wrap items-start gap-1.5">
      <span className={`rounded px-1.5 py-0.5 font-medium ${SEV_BADGE[issue.severity]}`}>
        {SEV_RU[issue.severity]}
      </span>
      <span className="font-mono text-fg-muted">{loc}</span>
      <span className="text-fg">{issue.description}</span>
    </li>
  );
}
