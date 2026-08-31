/**
 * Planner Tree-of-Thoughts mode (MVP-3 C4).
 *
 * When PLANNER_TOT_ENABLED=true or options.totMode=true:
 *   - Generate N=3 candidate plans with different approach hints.
 *   - Score each via a simple heuristic (no extra LLM call).
 *   - Pick the highest-scoring plan; tie-break by first.
 *
 * Falls back to standard generatePlanTasks when the flag is off.
 */

import type { ChatConfig, ChatMessage, ModelProvider } from './types';
import { PLANNER_MAX_TASKS, PLANNER_SYSTEM_PROMPT } from './planner-prompt';
import { collectChatText, generatePlanTasks, parsePlanTasks } from './planner';
import type { GeneratePlanOptions, PlanTask } from './planner';
import { assertCapability, runWithRoleAsync } from './policy';

const TOT_CANDIDATES = 3;

/** Approach hints appended to the system prompt per candidate. */
const APPROACH_HINTS: readonly string[] = [
  '',
  '\n\nApproach preference: layer tasks bottom-up (data model → API → UI).',
  '\n\nApproach preference: prefer a vertical slice per feature so each slice is independently deployable.',
];

export type TotOptions = GeneratePlanOptions & {
  /** Override env var to force ToT mode on/off. */
  totMode?: boolean;
  /** Number of candidates to generate (default 3). */
  candidates?: number;
};

/**
 * Heuristic score for a candidate plan (0–3).
 * +1 task count in [1, PLANNER_MAX_TASKS]
 * +1 all dependency titles reference real task titles
 * +1 all tasks have non-empty acceptance
 */
export function scorePlanCandidate(tasks: PlanTask[]): number {
  if (tasks.length === 0) return 0;
  let score = 0;
  if (tasks.length <= PLANNER_MAX_TASKS) score += 1;
  const titles = new Set(tasks.map((t) => t.title));
  if (tasks.every((t) => t.dependencies.every((d) => titles.has(d)))) score += 1;
  if (tasks.every((t) => t.acceptance.trim().length > 0)) score += 1;
  return score;
}

async function runOneCandidate(
  provider: ModelProvider,
  specMarkdown: string,
  hint: string,
  options: GeneratePlanOptions,
): Promise<PlanTask[] | null> {
  const config: ChatConfig = {
    model: options.model ?? 'planner',
    apiKey: options.apiKey,
    systemPrompt: PLANNER_SYSTEM_PROMPT + hint,
  };
  const messages: ChatMessage[] = [{ role: 'USER', content: specMarkdown }];
  try {
    const text = await collectChatText(provider.chat(messages, config));
    return parsePlanTasks(text);
  } catch {
    return null;
  }
}

async function runCandidates(
  provider: ModelProvider,
  specMarkdown: string,
  n: number,
  options: GeneratePlanOptions,
): Promise<PlanTask[][]> {
  const hints = APPROACH_HINTS.slice(0, Math.min(n, APPROACH_HINTS.length));
  const results = await Promise.all(
    hints.map((hint) => runOneCandidate(provider, specMarkdown, hint, options)),
  );
  return results.filter((r): r is PlanTask[] => r !== null);
}

function pickBest(candidates: PlanTask[][]): PlanTask[] | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = scorePlanCandidate(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const score = scorePlanCandidate(candidates[i]);
    if (score > bestScore) {
      best = candidates[i];
      bestScore = score;
    }
  }
  return best;
}

/**
 * Planner with optional Tree-of-Thoughts.
 * Respects PLANNER_TOT_ENABLED env var or options.totMode.
 * Falls back to standard generatePlanTasks when ToT is off.
 */
export async function generatePlanTasksWithToT(
  provider: ModelProvider,
  specMarkdown: string,
  options: TotOptions = {},
): Promise<PlanTask[]> {
  const totEnabled = options.totMode === true || process.env['PLANNER_TOT_ENABLED'] === 'true';
  if (!totEnabled) {
    return generatePlanTasks(provider, specMarkdown, options);
  }
  return runWithRoleAsync('planner', async () => {
    assertCapability('plan-tasks');
    assertCapability('read-spec');
    const n = options.candidates ?? TOT_CANDIDATES;
    const candidates = await runCandidates(provider, specMarkdown, n, options);
    const best = pickBest(candidates);
    if (!best) throw new Error('Planner ToT: all candidates failed to parse');
    return best;
  });
}
