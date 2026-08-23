import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root (tools/evals/src → ../../..). */
export const REPO_ROOT = join(here, '..', '..', '..');

/** Golden SPEC→plan fixtures. */
export const CASES_DIR = join(here, '..', 'cases');

export const CODER_AGENT_PATH = join(REPO_ROOT, '.claude', 'agents', 'coder.md');
export const PLANNER_AGENT_PATH = join(REPO_ROOT, '.claude', 'agents', 'planner.md');
export const REVIEWER_AGENT_PATH = join(REPO_ROOT, '.claude', 'agents', 'reviewer.md');
export const SANDBOX_RUNNER_PATH = join(REPO_ROOT, 'docker', 'aider-sandbox', 'runner.js');
