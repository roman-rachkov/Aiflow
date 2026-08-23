import { readFile } from 'node:fs/promises';

import { PLANNER_SYSTEM_PROMPT, REVIEWER_SYSTEM_PROMPT } from '@aiflow/ai-roles';

import {
  CODER_AGENT_PATH,
  PLANNER_AGENT_PATH,
  REVIEWER_AGENT_PATH,
  SANDBOX_RUNNER_PATH,
} from './paths.ts';
import type { CheckResult } from './types.ts';

/** Prompt-contract regression for Planner / Reviewer / Coder surfaces. */
export async function scorePromptContracts(): Promise<CheckResult[]> {
  const [coderAgent, plannerAgent, reviewerAgent, runnerSrc] = await Promise.all([
    readFile(CODER_AGENT_PATH, 'utf8'),
    readFile(PLANNER_AGENT_PATH, 'utf8'),
    readFile(REVIEWER_AGENT_PATH, 'utf8'),
    readFile(SANDBOX_RUNNER_PATH, 'utf8'),
  ]);
  const sandboxCoder = extractCoderCore(runnerSrc);
  return [
    ...requirePhrases('coder.agent', coderAgent, [
      'never commit',
      '200 lines',
      'function over 50',
      'English',
      'TypeScript',
      'ESLint',
    ]),
    ...requirePhrases('coder.sandbox', sandboxCoder, [
      'Never commit',
      'file ≤ 200',
      'function ≤ 50',
      'English',
      'TypeScript',
      'ESLint',
    ]),
    ...requirePhrases('planner.runtime', PLANNER_SYSTEM_PROMPT, [
      'JSON array',
      'dependencies',
      'acceptance',
      'smoke-test',
      'PENDING',
    ]),
    ...requirePhrases('planner.agent', plannerAgent, ['Role', 'SPEC.md', 'atomic']),
    ...requirePhrases('reviewer.runtime', REVIEWER_SYSTEM_PROMPT, [
      'ACCEPTED',
      'REJECTED',
      'confidence',
      'issues',
      'English',
    ]),
    ...requirePhrases('reviewer.agent', reviewerAgent, ['Role', 'ACCEPTED', 'REJECTED']),
  ];
}

function extractCoderCore(runnerSrc: string): string {
  const match = runnerSrc.match(/const CODER_CORE_PROMPT = `([\s\S]*?)`;/);
  if (!match?.[1]) {
    throw new Error('CODER_CORE_PROMPT not found in sandbox runner.js');
  }
  return match[1];
}

function requirePhrases(label: string, text: string, phrases: string[]): CheckResult[] {
  return phrases.map((phrase) => {
    const ok = text.includes(phrase);
    return {
      name: `prompt:${label}:${phrase}`,
      ok,
      detail: ok ? undefined : `missing "${phrase}"`,
    };
  });
}
