#!/usr/bin/env tsx
/**
 * MVP-3 D4 stabilization gate — offline bundle of evals, load isolation,
 * and dogfood wiring smoke. Does not replace live compose dogfood (MVP2-51).
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');

type Step = { name: string; cmd: string; args: string[] };

const STEPS: Step[] = [
  { name: 'evals', cmd: 'yarn', args: ['evals'] },
  {
    name: 'load-isolation',
    cmd: 'yarn',
    args: ['vitest', 'run', 'tools/load-test/src/isolation.test.ts'],
  },
  { name: 'dogfood-smoke', cmd: 'yarn', args: ['dogfood-smoke'] },
  { name: 'prod-check', cmd: 'yarn', args: ['prod-check'] },
];

function runStep(step: Step): void {
  console.log(`\n[stabilization] ${step.name}…`);
  execFileSync(step.cmd, step.args, { cwd: ROOT, stdio: 'inherit' });
}

function main(): void {
  console.log('[stabilization] starting offline stabilization gate (MVP3-D4)');
  for (const step of STEPS) {
    runStep(step);
  }
  console.log('\n[stabilization] all steps passed');
}

main();
