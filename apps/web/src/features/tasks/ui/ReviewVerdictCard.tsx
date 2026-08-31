'use client';

import { AUTO_APPROVE_THRESHOLD, isAutoApproved } from './parse-review';
import type { ParsedReviewVerdict } from './parse-review';
import { ReviewIssueList } from './ReviewIssueList';

type Props = {
  review: ParsedReviewVerdict;
};

/** Full Reviewer verdict card (MVP-3 D1): verdict, confidence, issues list, auto-approve badge. */
export function ReviewVerdictCard({ review }: Props) {
  const accepted = review.verdict === 'ACCEPTED';
  const autoApproved = isAutoApproved(review);
  const tone = accepted ? 'text-emerald-700' : 'text-red-700';
  const label = accepted ? 'Ревью: принято' : 'Ревью: отклонено';

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
      <VerdictHeader
        label={label}
        tone={tone}
        confidence={review.confidence}
        autoApproved={autoApproved}
      />
      <p className="mt-1 text-fg">{review.summary}</p>
      {review.issueCount > 0 ? (
        <ReviewIssueList issues={review.issues} />
      ) : (
        <p className="mt-1 text-xs text-fg-muted">Замечаний нет</p>
      )}
      {review.suggestions ? (
        <p className="mt-2 text-xs text-fg-muted">Рекомендации: {review.suggestions}</p>
      ) : null}
    </div>
  );
}

type HeaderProps = {
  label: string;
  tone: string;
  confidence: number;
  autoApproved: boolean;
};

function VerdictHeader({ label, tone, confidence, autoApproved }: HeaderProps) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`font-medium ${tone}`}>{label}</p>
      <ConfidenceBadge pct={pct} threshold={AUTO_APPROVE_THRESHOLD} />
      {autoApproved ? <AutoApproveBadge /> : null}
    </div>
  );
}

function ConfidenceBadge({ pct, threshold }: { pct: number; threshold: number }) {
  const thresholdPct = Math.round(threshold * 100);
  const meetsThreshold = pct >= thresholdPct;
  const cls = meetsThreshold ? 'text-emerald-700' : 'text-fg-muted';
  return (
    <span className={`text-xs font-normal ${cls}`}>
      уверенность {pct}%<span className="ml-1 text-fg-muted">(порог {thresholdPct}%)</span>
    </span>
  );
}

function AutoApproveBadge() {
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
      авто-одобрено
    </span>
  );
}
