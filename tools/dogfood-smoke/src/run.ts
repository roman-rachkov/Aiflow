#!/usr/bin/env tsx
/**
 * Run automated dogfood gate tests and append evidence to EVIDENCE.md.
 * Does not replace live compose dogfood — records CI-automated proof for R01/R05 wiring.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../../..');
const EVIDENCE = join(ROOT, 'specs/slim-mvp1-dogfood/EVIDENCE.md');

function gitShortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runTests(): { passed: number; failed: number } {
  const out = execFileSync(
    'yarn',
    ['vitest', 'run', 'tools/dogfood-smoke/src/pipeline-smoke.test.ts'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const match = out.match(/Tests\s+(\d+) passed/);
  const n = match ? Number.parseInt(match[1], 10) : 0;
  return { passed: n, failed: 0 };
}

const { passed } = runTests();
const date = new Date().toISOString().slice(0, 10);
const sha = gitShortSha();

const entry = `
## Run automated-${date}

| Field    | Value |
| -------- | ----- |
| Date     | ${date} |
| Operator | yarn dogfood-smoke (CI gate) |
| Branch   | main@${sha} |
| Model    | mocked — handler wiring only |
| Sandbox  | not required (unit gate) |

### Checklist result

| Step | Outcome | Notes |
| ---- | ------- | ----- |
| 1. \`docker compose up\` | skip | automated gate — no live stack |
| 2. Sandbox image build | skip | |
| 3. Researcher → SPEC | skip | |
| 4. Plan generation wiring | PASS | validatePlanPayload + parsePlanTasks |
| 5. Code execution wiring | PASS | review retry cap + deploy claim |
| 6. WS logs + commit | skip | live sandbox required |
| 7. Deploy URL builder | PASS | buildDeployUrl smoke |

### Overall result

\`R01: PARTIAL\` — Planner→Coder path validated at handler/parse layer; live LLM+sandbox still operator-run.
\`R05: PARTIAL\` — automated gate proves slim path wiring; full codegen needs compose.

### Artefacts

- Test file: \`tools/dogfood-smoke/src/pipeline-smoke.test.ts\`
- Tests passed: ${String(passed)}

`;

const existing = readFileSync(EVIDENCE, 'utf8');
if (!existing.includes(`## Run automated-${date}`)) {
  appendFileSync(EVIDENCE, entry);
  console.log(`Appended evidence entry to ${EVIDENCE}`);
} else {
  console.log('Evidence entry for today already exists — skipped append');
}

console.log(`dogfood-smoke: ${String(passed)} tests passed`);
