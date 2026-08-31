/**
 * Reviewer LLM invocation: drain chat → parse verdict JSON → retry on failure.
 * Decision C3: validate JSON + max 2 retries (3 attempts total). Mirrors planner.
 */

import type { ChatConfig, ChatMessage, ModelProvider } from './types';
import { collectChatText } from './planner';
import { assertCapability, runWithRoleAsync } from './policy';
import { extractJsonObject, parseReviewVerdict } from './reviewer-parse';
import { REVIEWER_SYSTEM_PROMPT } from './reviewer-prompt';

export type ReviewVerdictKind = 'ACCEPTED' | 'REJECTED';
export type ReviewIssueSeverity = 'error' | 'warning' | 'info';

export type ReviewIssue = {
  file: string;
  line: number | string;
  severity: ReviewIssueSeverity;
  description: string;
};

export type ReviewVerdict = {
  verdict: ReviewVerdictKind;
  confidence: number;
  summary: string;
  details: {
    acceptance_met: boolean;
    compilation: boolean;
    lint: boolean;
    tests: boolean | null;
    issues: ReviewIssue[];
    suggestions: string;
  };
};

export type ReviewTaskInput = {
  title: string;
  description: string;
  acceptance: string;
  diff: string;
  checks?: {
    typescript?: boolean | null;
    eslint?: boolean | null;
    tests?: boolean | null;
  };
};

const MAX_PARSE_RETRIES = 2;

export type GenerateReviewOptions = {
  maxRetries?: number;
  model?: string;
  apiKey?: string;
};

export { extractJsonObject, parseReviewVerdict };

/** Call the provider with the reviewer prompt; retry on parse failure. */
export async function generateReviewVerdict(
  provider: ModelProvider,
  task: ReviewTaskInput,
  options: GenerateReviewOptions = {},
): Promise<ReviewVerdict> {
  return runWithRoleAsync('reviewer', async () => {
    assertCapability('verdict');
    assertCapability('read-diff');
    return generateReviewVerdictInner(provider, task, options);
  });
}

async function generateReviewVerdictInner(
  provider: ModelProvider,
  task: ReviewTaskInput,
  options: GenerateReviewOptions,
): Promise<ReviewVerdict> {
  const maxRetries = options.maxRetries ?? MAX_PARSE_RETRIES;
  const config: ChatConfig = {
    model: options.model ?? 'reviewer',
    apiKey: options.apiKey,
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
  };
  const messages: ChatMessage[] = [{ role: 'USER', content: buildReviewUserPrompt(task) }];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const text = await collectChatText(provider.chat(messages, config));
      return parseReviewVerdict(text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Reviewer parse failed');
}

/** Build the USER message body for the Reviewer. */
export function buildReviewUserPrompt(task: ReviewTaskInput): string {
  const checks = task.checks ?? {};
  return [
    `Title: ${task.title}`,
    `Description:\n${task.description}`,
    `Acceptance:\n${task.acceptance}`,
    `Automated checks: typescript=${fmtCheck(checks.typescript)}; eslint=${fmtCheck(checks.eslint)}; tests=${fmtCheck(checks.tests)}`,
    'Diff:',
    task.diff.trim() === '' ? '(empty diff)' : task.diff,
  ].join('\n\n');
}

function fmtCheck(value: boolean | null | undefined): string {
  if (value === true) return 'passed';
  if (value === false) return 'failed';
  return 'absent';
}
