'use client';

import type { ParsedReviewVerdict } from './parse-review';

type Props = {
  review: ParsedReviewVerdict;
};

/** Compact Reviewer verdict summary for the tasks list (MVP-2 4.1). */
export function ReviewVerdictCard({ review }: Props) {
  const accepted = review.verdict === 'ACCEPTED';
  const label = accepted ? 'Ревью: принято' : 'Ревью: отклонено';
  const tone = accepted ? 'text-emerald-700' : 'text-red-700';

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
      <p className={`font-medium ${tone}`}>
        {label}
        <span className="ml-2 text-xs font-normal text-fg-muted">
          уверенность {Math.round(review.confidence * 100)}%
        </span>
      </p>
      <p className="mt-1 text-fg">{review.summary}</p>
      {review.issueCount > 0 ? (
        <p className="mt-1 text-xs text-fg-muted">Замечаний: {review.issueCount}</p>
      ) : null}
      {review.suggestions ? (
        <p className="mt-1 text-xs text-fg-muted">{review.suggestions}</p>
      ) : null}
    </div>
  );
}
