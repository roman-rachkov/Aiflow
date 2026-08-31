/**
 * Step encoding for code:execute (MVP-3 A2).
 * Checkpoints live in TaskLog; resume skips finished durable steps.
 */

export const PIPELINE_STEPS = ['CLONE', 'CHECKOUT', 'SANDBOX', 'PARSE', 'PUSH', 'DONE'] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/** Starts a new attempt; completed steps are read after the latest marker. */
export const ATTEMPT_MARKER = '=== PIPELINE_ATTEMPT ===';

/** TaskLog line when a step finishes successfully. */
export function stepDoneMarker(step: PipelineStep): string {
  return `=== PIPELINE_STEP:${step} ===`;
}

const STEP_RE = /^=== PIPELINE_STEP:(CLONE|CHECKOUT|SANDBOX|PARSE|PUSH|DONE) ===/;

/** Gitea/Git checkpoint ref so unpushed sandbox commits survive workDir wipe. */
export function checkpointRefName(taskId: string): string {
  return `refs/aistudio/task/${taskId}`;
}

/** Messages after the last attempt marker (or all if none). */
export function messagesForLatestAttempt(messages: string[]): string[] {
  let start = 0;
  for (const [i, msg] of messages.entries()) {
    if (msg.includes(ATTEMPT_MARKER)) start = i + 1;
  }
  return messages.slice(start);
}

/** Ordered unique completed steps from attempt log lines. */
export function parseCompletedSteps(messages: string[]): PipelineStep[] {
  const found = new Set<PipelineStep>();
  for (const msg of messagesForLatestAttempt(messages)) {
    for (const line of msg.split('\n')) {
      const m = STEP_RE.exec(line.trim());
      if (m) found.add(m[1] as PipelineStep);
    }
  }
  return PIPELINE_STEPS.filter((s) => found.has(s));
}

/** Resume cursor: a step to run, or COMPLETE when all steps finished. */
export type ResumePoint = PipelineStep | 'COMPLETE';

/**
 * First unfinished durable step.
 * Before `headCommit` (PARSE), the workDir is ephemeral — resume from CLONE.
 * After `headCommit`, skip sandbox and resume at PUSH or DONE from TaskLog.
 */
export function firstUnfinishedStep(
  completed: PipelineStep[],
  headCommit: string | null,
): ResumePoint {
  if (!headCommit) return 'CLONE';
  const done = new Set(completed);
  // headCommit implies SANDBOX+PARSE finished (checkpoint ref on remote).
  if (!done.has('PUSH')) return 'PUSH';
  if (!done.has('DONE')) return 'DONE';
  return 'COMPLETE';
}

/** True when `step` is strictly before `resumeFrom` in the pipeline. */
export function isBeforeStep(step: PipelineStep, resumeFrom: PipelineStep): boolean {
  return PIPELINE_STEPS.indexOf(step) < PIPELINE_STEPS.indexOf(resumeFrom);
}
