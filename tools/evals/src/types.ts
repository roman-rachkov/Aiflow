/** Golden-case and eval result types (MVP-3 B3). */

export type PlanExpectations = {
  minTasks: number;
  maxTasks: number;
  /** Substrings that must appear in at least one task title. */
  mustIncludeTitleSubstrings: string[];
  /** Substrings that must not appear in any title/description. */
  mustNotIncludeSubstrings: string[];
  /** Last task title or acceptance must mention smoke/e2e. */
  requireSmokeTest: boolean;
  /** Substrings that must appear somewhere in titles or descriptions. */
  requiredMentions: string[];
};

export type GoldenCase = {
  id: string;
  spec: string;
  expectations: PlanExpectations;
  /** Offline planner response (JSON array text). */
  fixturePlan: string;
};

export type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type EvalRunResult = {
  checks: CheckResult[];
  passed: number;
  failed: number;
  mode: 'offline' | 'live';
  langfuseReported: boolean;
};
