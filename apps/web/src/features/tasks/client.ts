/**
 * Client-safe exports for the tasks UI (Tasks 3.2–3.3).
 */

export { TasksPanel } from './ui/TasksPanel';
export { ExecuteControls } from './ui/ExecuteControls';
export { TaskLogPanel } from './ui/TaskLogPanel';
export { ReviewVerdictCard } from './ui/ReviewVerdictCard';
export { ReviewIssueList } from './ui/ReviewIssueList';
export {
  parseLatestReview,
  isAutoApproved,
  REVIEW_LOG_MARKER,
  AUTO_APPROVE_THRESHOLD,
} from './ui/parse-review';
export type { ParsedReviewVerdict, ReviewIssue, ReviewIssueSeverity } from './ui/parse-review';
