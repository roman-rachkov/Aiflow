import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import type { TaskSummary } from '@/features/tasks';

export type StepResult = { name: string; ok: boolean; detail?: string };

export function taskOutcome(tasks: TaskSummary[]): { ok: boolean; detail: string } {
  if (tasks.length === 0) return { ok: false, detail: 'no tasks' };
  const failed = tasks.filter((t) => t.status === 'FAILED');
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const done = tasks.filter((t) => t.status === 'DONE');
  const pending = tasks.filter((t) => t.status === 'PENDING' || t.status === 'AWAITING_REVIEW');
  if (failed.length > 0) {
    return { ok: false, detail: `failed: ${failed.map((t) => t.title).join(', ')}` };
  }
  if (inProgress.length > 0 || pending.length > 0) {
    return {
      ok: false,
      detail: `${String(done.length)}/${String(tasks.length)} DONE; active: ${inProgress.length + pending.length}`,
    };
  }
  if (done.length !== tasks.length) {
    return { ok: false, detail: `${String(done.length)}/${String(tasks.length)} DONE` };
  }
  return { ok: true, detail: `${String(done.length)}/${String(tasks.length)} DONE` };
}

export function appendDogfoodEvidence(
  root: string,
  steps: StepResult[],
  projectId: string,
  overall: string,
): void {
  const date = new Date().toISOString().slice(0, 10);
  const sha = execShortSha();
  const paths = [
    join(root, 'specs/slim-mvp1-dogfood/EVIDENCE.md'),
    join(root, 'specs/mvp2-full-dogfood/EVIDENCE.md'),
  ];
  const block = `
## Run live-${date}

| Field    | Value |
| -------- | ----- |
| Date     | ${date} |
| Operator | yarn dogfood-live (compose) |
| Branch   | main@${sha} |
| Project  | ${projectId} |
| SPEC     | tools/evals/cases/todo-crud/spec.md |

### Checklist result

| Step | Outcome | Notes |
| ---- | ------- | ----- |
${steps.map((s) => `| ${s.name} | ${s.ok ? 'PASS' : 'FAIL'} | ${s.detail ?? ''} |`).join('\n')}

### Overall result

${overall}

`;
  for (const path of paths) {
    const existing = readFileSync(path, 'utf8');
    if (!existing.includes(`## Run live-${date}`)) appendFileSync(path, block);
  }
}

function execShortSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => {
    setTimeout(r, ms);
  });
}

export async function pollUntil(
  label: string,
  timeoutMs: number,
  pollMs: number,
  check: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    process.stdout.write(`. waiting ${label}\n`);
    await sleep(pollMs);
  }
  throw new Error(`Timeout waiting for ${label}`);
}
