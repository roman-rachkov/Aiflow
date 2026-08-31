#!/usr/bin/env tsx
/**
 * Golden SPEC→plan→code evals CLI (MVP-3 B3).
 * Offline fixtures by default; EVALS_LIVE=1 calls the env LLM provider.
 * Langfuse score upload is noop without LANGFUSE_* keys.
 */

import { runEvals } from './run-evals.ts';

async function main(): Promise<void> {
  const result = await runEvals();
  const lines = result.checks.map((c) => {
    const mark = c.ok ? 'PASS' : 'FAIL';
    const detail = c.detail ? ` — ${c.detail}` : '';
    return `${mark}  ${c.name}${detail}`;
  });
  process.stdout.write(
    [
      `evals mode=${result.mode} passed=${String(result.passed)} failed=${String(result.failed)} langfuse=${String(result.langfuseReported)}`,
      ...lines,
      '',
    ].join('\n'),
  );
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`evals error: ${message}\n`);
  process.exitCode = 1;
});
